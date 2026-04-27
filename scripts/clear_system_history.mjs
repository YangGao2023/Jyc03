import fs from 'node:fs';
import { createClient } from 'redis';

for (const p of [
  'C:\\Users\\xgtou\\.openclaw-A3\\workspace\\ai-control-panel\\scripts\\.env',
  'C:\\Users\\xgtou\\.openclaw-A3\\workspace\\ai-control-panel\\.env.development.local',
]) {
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

if (!process.env.REDIS_URL) throw new Error('Missing REDIS_URL');

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();
await client.set('agent-bridge:inbox', '[]');
await client.set('agent-bridge:outbox', '[]');
await client.del('agent-bridge:event-chain');
const types = {
  inbox: await client.type('agent-bridge:inbox'),
  outbox: await client.type('agent-bridge:outbox'),
  eventChain: await client.type('agent-bridge:event-chain'),
};
const inbox = await client.get('agent-bridge:inbox');
const outbox = await client.get('agent-bridge:outbox');
console.log(JSON.stringify({
  ok: true,
  types,
  inbox,
  outbox,
}, null, 2));
await client.quit();
