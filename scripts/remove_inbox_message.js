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
  const [messageId] = process.argv.slice(2);
  if (!messageId) throw new Error('usage: node remove_inbox_message.js <messageId>');
  const env = loadEnv('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/.env.runtime');
  const client = createClient({ url: env.REDIS_URL });
  await client.connect();
  const inbox = JSON.parse((await client.get('agent-bridge:inbox')) || '[]');
  const next = inbox.filter((item) => item.id !== messageId);
  await client.set('agent-bridge:inbox', JSON.stringify(next));
  console.log(JSON.stringify({ ok: true, removed: messageId, before: inbox.length, after: next.length }, null, 2));
  await client.quit();
})();
