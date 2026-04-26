import os
import subprocess
from pathlib import Path

base_dir = Path(__file__).resolve().parent
base_env_path = base_dir / '.env'
zero_env_path = base_dir / '.env.zero'

env_dict = os.environ.copy()

def load_env(path: Path):
    if not path.exists():
        return
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env_dict[k.strip()] = v.strip()

load_env(base_env_path)
load_env(zero_env_path)

env_dict['AGENT_BRIDGE_BASE_URL'] = env_dict.get('AGENT_BRIDGE_BASE_URL', 'https://ai-control-panel-gamma.vercel.app').strip()
env_dict['AGENT_BRIDGE_POLL_INTERVAL'] = env_dict.get('AGENT_BRIDGE_POLL_INTERVAL', '10').strip()
env_dict['AGENT_BRIDGE_LIMIT'] = env_dict.get('AGENT_BRIDGE_LIMIT', '10').strip()
env_dict['AGENT_BRIDGE_RECIPIENT'] = '零号'
env_dict['AGENT_BRIDGE_LOG'] = str((base_dir / 'state' / 'agent-bridge-zero.jsonl').resolve())
env_dict['AGENT_BRIDGE_AUDIO_DIR'] = str((base_dir / 'state' / 'agent-bridge-zero-audio').resolve())

if not env_dict.get('AGENT_BRIDGE_HMAC_SECRET', '').strip():
    raise SystemExit('Missing AGENT_BRIDGE_HMAC_SECRET')

print('Starting zero poller for recipient=零号...')
subprocess.run(['python', 'agent_bridge_poller.py'], env=env_dict, cwd=str(base_dir), check=False)
