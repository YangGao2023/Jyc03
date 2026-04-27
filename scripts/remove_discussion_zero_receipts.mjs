import fs from 'node:fs';
import { createClient } from 'redis';

const env = fs.readFileSync(new URL('../.env.runtime', import.meta.url), 'utf8');
const match = env.match(/REDIS_URL="([^"]+)"/);
const url = match?.[1];
if (!url) throw new Error('REDIS_URL missing');

const topicId = process.argv[2];
if (!topicId) throw new Error('topicId required');

const client = createClient({ url });
await client.connect();
const raw = await client.get('agent-bridge:inbox');
const items = raw ? JSON.parse(raw) : [];
const filtered = items.filter((item) => {
  const meta = item?.meta || {};
  const commandMeta = meta.commandMeta || {};
  return !(meta.source === 'zero-telegram-bridge' && commandMeta.topicId === topicId && String(meta.commandKind || '').toLowerCase() === 'discussion');
});
await client.set('agent-bridge:inbox', JSON.stringify(filtered));
console.log(JSON.stringify({ before: items.length, after: filtered.length }, null, 2));
await client.quit();
