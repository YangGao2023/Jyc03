import os
import subprocess
from pathlib import Path

base_dir = Path(__file__).resolve().parent
env_path = base_dir / ".env"
with open(env_path, "a", encoding="utf-8") as f:
    f.write("\nAGENT_BRIDGE_BASE_URL=https://ai-control-panel-gamma.vercel.app\n")
    f.write("AGENT_BRIDGE_HMAC_SECRET=d78e2358485cb2c80be188ba3f5328009b5e30cef0f81b5322227e33118e7815\n")
    f.write("AGENT_BRIDGE_POLL_INTERVAL=10\n")
    f.write("AGENT_BRIDGE_LIMIT=10\n")

env_dict = os.environ.copy()
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        if line.strip() and not line.startswith("#") and "=" in line:
            k, v = line.strip().split("=", 1)
            env_dict[k.strip()] = v.strip()

recipient = env_dict.get("AGENT_BRIDGE_RECIPIENT", "").strip()
if not recipient:
    raise SystemExit("AGENT_BRIDGE_RECIPIENT is required. Refusing to start a poller that would consume the shared outbox without routing.")

print(f"Starting poller for recipient={recipient}...")
subprocess.run(["python", "agent_bridge_poller.py"], env=env_dict, cwd=str(base_dir))
