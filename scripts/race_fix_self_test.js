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
  const env = loadEnv('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/.env.runtime');
  const client = createClient({ url: env.REDIS_URL });
  await client.connect();

  const topicId = `topic-race-fix-${Date.now()}`;
  const title = '并发双投递修复验收 topic';
  const prompt = '这是并发双投递修复验收，请阿三回复：A3 RACE FIX OK；请零号回复：ZERO RACE FIX OK。';
  const participants = ['阿三', '零号'];
  const now = new Date().toISOString();

  await client.hSet('agent-bridge:discussion-threads', topicId, JSON.stringify({
    id: topicId,
    title,
    prompt,
    participants,
    status: 'open',
    createdBy: 'YANG',
    summary: 'race-fix self test',
    createdAt: now,
    updatedAt: now,
  }));

  const rawQueue = await client.get('agent-bridge:outbox');
  const queue = rawQueue ? JSON.parse(rawQueue) : [];
  const messages = participants.map((to) => ({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: 'discussion',
    from: 'YANG',
    to,
    text: prompt,
    meta: {
      source: 'race-fix-self-test',
      topicId,
      topicTitle: title,
      discussionStatus: 'open',
      participants,
    },
  }));

  queue.push(...messages);
  await client.set('agent-bridge:outbox', JSON.stringify(queue));

  for (const message of messages) {
    const wake = {
      id: `WAKE-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      targetAgent: message.to,
      kind: 'outbox_message',
      relatedId: message.id,
      createdAt: new Date().toISOString(),
      note: `discussion:${topicId}`,
    };
    await client.hSet('agent-bridge:wake-queue', wake.id, JSON.stringify(wake));
  }

  console.log(JSON.stringify({ topicId, messages: messages.map(({ id, to }) => ({ id, to })) }, null, 2));
  await client.quit();
})();
