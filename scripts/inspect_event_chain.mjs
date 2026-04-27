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

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();
const type = await client.type('agent-bridge:event-chain');
let data = null;
if (type === 'hash') data = await client.hGetAll('agent-bridge:event-chain');
if (type === 'string') data = await client.get('agent-bridge:event-chain');
console.log(JSON.stringify({ type, data }, null, 2));
await client.quit();
