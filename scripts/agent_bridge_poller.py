import hashlib
import hmac
import json
import mimetypes
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

BASE_URL = os.environ.get("AGENT_BRIDGE_BASE_URL", "").rstrip("/")
SHARED_SECRET = os.environ.get("AGENT_BRIDGE_HMAC_SECRET", "")
POLL_INTERVAL = int(os.environ.get("AGENT_BRIDGE_POLL_INTERVAL", "10"))
LIMIT = int(os.environ.get("AGENT_BRIDGE_LIMIT", "10"))
HANDLER_COMMAND = os.environ.get("AGENT_BRIDGE_HANDLER_COMMAND", "").strip()
LOG_PATH = Path(os.environ.get("AGENT_BRIDGE_LOG", "./state/agent-bridge-outbox.jsonl"))
AUDIO_DIR = Path(os.environ.get("AGENT_BRIDGE_AUDIO_DIR", "./state/agent-bridge-audio"))
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_TTS_MODEL = os.environ.get("AGENT_BRIDGE_TTS_MODEL", "tts-1")
OPENAI_TTS_VOICE = os.environ.get("AGENT_BRIDGE_TTS_VOICE", "alloy")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
DEFAULT_TELEGRAM_CHAT_ID = os.environ.get("AGENT_BRIDGE_TELEGRAM_CHAT_ID", "")


def sign(method: str, path: str, body: str = ""):
    timestamp = str(int(time.time() * 1000))
    nonce = uuid.uuid4().hex
    payload = ".".join([timestamp, nonce, method.upper(), path, body])
    signature = hmac.new(SHARED_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return {
        "x-bridge-timestamp": timestamp,
        "x-bridge-nonce": nonce,
        "x-bridge-signature": signature,
    }


def request_json(method: str, path: str, body=None):
    parsed = urllib.parse.urlsplit(path)
    path_for_signature = parsed.path or "/"
    body_text = json.dumps(body, separators=(",", ":")) if body is not None else ""
    headers = sign(method, path_for_signature, body_text)
    if body is not None:
        headers["content-type"] = "application/json"
    req = urllib.request.Request(
        url=f"{BASE_URL}{path}",
        method=method.upper(),
        data=body_text.encode("utf-8") if body is not None else None,
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def append_log(message):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(message, ensure_ascii=False) + "\n")


def resolve_voice_request(message):
    kind = str(message.get("kind") or "").lower()
    meta = message.get("meta") or {}
    if not isinstance(meta, dict):
        meta = {}

    wants_voice = kind == "voice" or bool(meta.get("voice")) or str(meta.get("delivery") or "").lower() == "voice"
    if not wants_voice:
        return None

    text = str(meta.get("tts_text") or message.get("text") or "").strip()
    if not text:
        raise RuntimeError("voice message missing text")

    chat_id = str(meta.get("telegram_chat_id") or meta.get("chat_id") or DEFAULT_TELEGRAM_CHAT_ID or "").strip()
    if not chat_id:
        raise RuntimeError("voice message missing telegram chat id")

    filename = str(meta.get("filename") or f"voice-{message.get('id') or uuid.uuid4().hex}.mp3")
    caption = str(meta.get("caption") or "")

    return {
        "text": text,
        "chat_id": chat_id,
        "filename": filename,
        "caption": caption,
    }


def synthesize_mp3(text: str, output_path: Path):
    if not OPENAI_API_KEY:
        raise RuntimeError("missing OPENAI_API_KEY")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        {
            "model": OPENAI_TTS_MODEL,
            "voice": OPENAI_TTS_VOICE,
            "input": text,
            "format": "mp3",
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url="https://api.openai.com/v1/audio/speech",
        method="POST",
        data=payload,
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        audio = resp.read()
    output_path.write_bytes(audio)
    return output_path


def encode_multipart(fields, files):
    boundary = f"----AgentBridge{uuid.uuid4().hex}"
    chunks = []

    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                str(value).encode("utf-8"),
                b"\r\n",
            ]
        )

    for name, file_path in files.items():
        mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                (
                    f'Content-Disposition: form-data; name="{name}"; filename="{file_path.name}"\r\n'
                    f"Content-Type: {mime_type}\r\n\r\n"
                ).encode(),
                file_path.read_bytes(),
                b"\r\n",
            ]
        )

    chunks.append(f"--{boundary}--\r\n".encode())
    body = b"".join(chunks)
    return boundary, body


def send_telegram_audio(chat_id: str, audio_path: Path, caption: str = ""):
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("missing TELEGRAM_BOT_TOKEN")

    fields = {"chat_id": chat_id}
    if caption:
        fields["caption"] = caption

    boundary, body = encode_multipart(fields, {"audio": audio_path})
    req = urllib.request.Request(
        url=f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendAudio",
        method="POST",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def maybe_handle_voice(message):
    voice_request = resolve_voice_request(message)
    if not voice_request:
        return False

    output_path = AUDIO_DIR / voice_request["filename"]
    synthesize_mp3(voice_request["text"], output_path)
    result = send_telegram_audio(voice_request["chat_id"], output_path, voice_request["caption"])
    print(
        f"[bridge][voice] delivered {message.get('id')} to telegram chat {voice_request['chat_id']} -> {output_path}"
    )
    print(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()
    return True


def handle_message(message):
    append_log(message)
    print(f"[bridge] {message.get('id')} {message.get('from')} -> {message.get('to')}: {message.get('text')}")
    sys.stdout.flush()

    if maybe_handle_voice(message):
        return

    if HANDLER_COMMAND:
        subprocess.run(HANDLER_COMMAND, input=json.dumps(message, ensure_ascii=False), text=True, shell=True, check=False)


def main():
    if not BASE_URL or not SHARED_SECRET:
        raise SystemExit("Missing AGENT_BRIDGE_BASE_URL or AGENT_BRIDGE_HMAC_SECRET")

    while True:
        try:
            query = urllib.parse.urlencode({"limit": LIMIT, "consume": 1})
            result = request_json("GET", f"/api/outbox?{query}")
            for message in result.get("messages", []):
                handle_message(message)
        except Exception as exc:
            print(f"[bridge] poll failed: {exc}", file=sys.stderr)
            sys.stderr.flush()
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
