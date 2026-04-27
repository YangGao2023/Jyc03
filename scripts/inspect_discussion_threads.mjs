import fs from 'node:fs';
import { createClient } from 'redis';

const env = fs.readFileSync(new URL('../.env.runtime', import.meta.url), 'utf8');
const match = env.match(/REDIS_URL="([^"]+)"/);
const url = match?.[1];
if (!url) throw new Error('REDIS_URL missing');

const client = createClient({ url });
await client.connect();
const type = await client.type('agent-bridge:discussion-threads');
console.log('type=', type);
if (type === 'hash') {
  console.log(JSON.stringify(await client.hGetAll('agent-bridge:discussion-threads'), null, 2));
} else if (type === 'string') {
  console.log(await client.get('agent-bridge:discussion-threads'));
}
await client.quit();
