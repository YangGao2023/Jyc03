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
  const [topicId, commandId, resultText] = process.argv.slice(2);
  if (!topicId || !commandId || !resultText) {
    throw new Error('usage: node manual_close_a3_topic.js <topicId> <commandId> <resultText>');
  }

  const env = loadEnv('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/.env.runtime');
  const client = createClient({ url: env.REDIS_URL });
  await client.connect();

  const threadRaw = await client.hGet('agent-bridge:discussion-threads', topicId);
  const thread = threadRaw ? JSON.parse(threadRaw) : null;
  if (!thread) throw new Error(`thread not found: ${topicId}`);

  const inbox = JSON.parse((await client.get('agent-bridge:inbox')) || '[]');
  const outbox = JSON.parse((await client.get('agent-bridge:outbox')) || '[]');
  const now = new Date().toISOString();

  inbox.push({
    id: `manual-${commandId}`,
    createdAt: now,
    kind: 'result',
    from: '阿三',
    to: 'YANG',
    text: resultText,
    meta: {
      source: 'manual-a3-closeout',
      commandId,
      commandKind: 'discussion',
      stage: 'result',
      commandMeta: {
        source: 'owner-discussion-a3-repair',
        topicId,
        topicTitle: thread.title,
        discussionStatus: 'open',
        participants: thread.participants,
      },
    },
  });

  await client.set('agent-bridge:inbox', JSON.stringify(inbox));
  await client.set(
    'agent-bridge:outbox',
    JSON.stringify(outbox.filter((item) => {
      const meta = item.meta || {};
      const direct = String(meta.topicId || '').trim();
      const nested = meta.commandMeta && typeof meta.commandMeta === 'object' ? String(meta.commandMeta.topicId || '').trim() : '';
      return direct !== topicId && nested !== topicId;
    })),
  );

  await client.hSet('agent-bridge:discussion-threads', topicId, JSON.stringify({
    ...thread,
    status: 'closed',
    summary: `本轮讨论已自动收口，${thread.participants.join(' / ')} 均已回复`,
    updatedAt: now,
  }));

  const pendingPath = 'C:/Users/xgtou/.openclaw-A3/workspace/state/a3-pending-commands.json';
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  for (const item of pending) {
    if (item.commandId === commandId) {
      item.writtenBack = true;
      item.resultText = resultText;
      item.writtenBackAt = now;
    }
  }
  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

  console.log(JSON.stringify({ ok: true, topicId, commandId, now }, null, 2));
  await client.quit();
})();
