const fs = require('fs');
const { createClient } = require('redis');

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

(async () => {
  const topicId = process.argv[2];
  if (!topicId) throw new Error('topicId required');
  const env = loadEnv('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/.env.runtime');
  const client = createClient({ url: env.REDIS_URL });
  await client.connect();

  const outbox = JSON.parse((await client.get('agent-bridge:outbox')) || '[]');
  const inbox = JSON.parse((await client.get('agent-bridge:inbox')) || '[]');
  const threadRaw = await client.hGet('agent-bridge:discussion-threads', topicId);
  const thread = threadRaw ? JSON.parse(threadRaw) : null;

  const pick = (m) => {
    const meta = m.meta || {};
    const direct = meta.topicId || '';
    const nested = meta.commandMeta && typeof meta.commandMeta === 'object' ? meta.commandMeta.topicId || '' : '';
    return direct === topicId || nested === topicId;
  };

  console.log(JSON.stringify({
    topicId,
    thread,
    outbox: outbox.filter(pick),
    inbox: inbox.filter(pick),
  }, null, 2));

  await client.quit();
})();
