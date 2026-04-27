const fs = require('fs');
const crypto = require('crypto');
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
  const title = process.argv[3] || '共享讨论修复';
  const text = process.argv.slice(4).join(' ').trim();
  if (!topicId || !text) throw new Error('usage: node resend_a3_topic.js <topicId> <title> <text...>');

  const env = loadEnv('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/.env.runtime');
  const client = createClient({ url: env.REDIS_URL });
  await client.connect();

  const commandId = crypto.randomUUID();
  const message = {
    id: commandId,
    createdAt: new Date().toISOString(),
    kind: 'discussion',
    from: 'YANG',
    to: '阿三',
    text,
    meta: {
      source: 'owner-discussion-a3-repair',
      topicId,
      topicTitle: title,
      discussionStatus: 'open',
      participants: ['阿三', '零号'],
    },
  };

  const outbox = JSON.parse((await client.get('agent-bridge:outbox')) || '[]');
  outbox.push(message);
  await client.set('agent-bridge:outbox', JSON.stringify(outbox));
  await client.hSet('agent-bridge:wake-queue', `WAKE-${Date.now()}-${Math.random().toString(36).slice(2)}`, JSON.stringify({
    id: `WAKE-${Date.now()}`,
    targetAgent: '阿三',
    kind: 'outbox_message',
    relatedId: commandId,
    createdAt: new Date().toISOString(),
    note: `discussion:${topicId}`,
  }));

  console.log(JSON.stringify({ commandId, topicId, to: '阿三' }, null, 2));
  await client.quit();
})();
