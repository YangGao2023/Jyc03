const fs = require('fs');
const crypto = require('crypto');

function loadEnv(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

async function main() {
  const env = loadEnv('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/.env.runtime');
  const path = '/api/zero/result';
  const body = JSON.stringify({
    from: '零号',
    to: 'YANG',
    commandId: 'cf5924be-9ca6-4c41-a955-aeb98acbd4d3',
    commandKind: 'discussion',
    stage: 'result',
    result: 'ZERO RACE FIX OK',
    meta: {
      topicId: 'topic-race-fix-1777051753178',
      topicTitle: '并发双投递修复验收 topic',
      discussionStatus: 'open',
      participants: ['阿三', '零号'],
      source: 'race-fix-self-test',
    },
  });
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const payload = [timestamp, nonce, 'POST', path, body].join('.');
  const signature = crypto.createHmac('sha256', env.AGENT_BRIDGE_HMAC_SECRET).update(payload).digest('hex');
  const response = await fetch(`https://ai-control-panel-gamma.vercel.app${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bridge-timestamp': timestamp,
      'x-bridge-nonce': nonce,
      'x-bridge-signature': signature,
    },
    body,
  });
  console.log(await response.text());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
