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

const keys = [
  'agent-bridge:promises',
  'agent-bridge:agent-status',
  'agent-bridge:wake-queue',
  'agent-bridge:v2:promises',
  'agent-bridge:v2:agent-status',
  'agent-bridge:v2:wake-queue',
  'agent-bridge:proofs',
  'agent-bridge:outbox',
  'agent-bridge:inbox',
];

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();
for (const key of keys) {
  const type = await client.type(key);
  let size = null;
  if (type === 'string') size = (await client.get(key))?.length ?? 0;
  if (type === 'hash') size = await client.hLen(key);
  if (type === 'list') size = await client.lLen(key);
  if (type === 'set') size = await client.sCard(key);
  if (type === 'zset') size = await client.zCard(key);
  console.log(JSON.stringify({ key, type, size }));
}
await client.quit();
