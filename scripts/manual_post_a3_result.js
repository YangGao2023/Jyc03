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
  const [topicId, topicTitle, commandId, resultText] = process.argv.slice(2);
  if (!topicId || !topicTitle || !commandId || !resultText) {
    throw new Error('usage: node manual_post_a3_result.js <topicId> <topicTitle> <commandId> <resultText>');
  }

  const env = loadEnv('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/.env.runtime');
  const client = createClient({ url: env.REDIS_URL });
  await client.connect();

  const inbox = JSON.parse((await client.get('agent-bridge:inbox')) || '[]');
  const now = new Date().toISOString();
  inbox.push({
    id: `manual-a3-${commandId}`,
    createdAt: now,
    kind: 'result',
    from: '阿三',
    to: 'YANG',
    text: resultText,
    meta: {
      source: 'manual-a3-result-sync',
      commandId,
      commandKind: 'discussion',
      stage: 'result',
      commandMeta: {
        source: 'owner-discussion',
        topicId,
        topicTitle,
        discussionStatus: 'open',
        participants: ['阿三', '零号'],
      },
    },
  });
  await client.set('agent-bridge:inbox', JSON.stringify(inbox));

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
