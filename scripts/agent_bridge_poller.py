import hashlib
import hmac
import json
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
    body_text = json.dumps(body, separators=(",", ":")) if body is not None else ""
    headers = sign(method, path, body_text)
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


def handle_message(message):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(message, ensure_ascii=False) + "\n")

    print(f"[bridge] {message.get('id')} {message.get('from')} -> {message.get('to')}: {message.get('text')}")
    sys.stdout.flush()

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
