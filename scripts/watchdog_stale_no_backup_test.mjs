import fs from 'node:fs';
import crypto from 'node:crypto';
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

const base = 'https://ai-control-panel-gamma.vercel.app';
const secret = process.env.AGENT_BRIDGE_HMAC_SECRET;
const redisUrl = process.env.REDIS_URL;
const redis = createClient({ url: redisUrl });
await redis.connect();

const agent = 'stale-no-backup-test';
const promiseId = `PROMISE-STALENOBAK-${Date.now()}`;

await redis.hSet('agent-bridge:agent-status', agent, JSON.stringify({
  agent,
  status: 'standby',
  updatedAt: '2026-04-22T00:00:00.000Z',
  summary: 'seeded stale test',
}));

await redis.hSet('agent-bridge:promises', promiseId, JSON.stringify({
  id: promiseId,
  kind: 'followup',
  title: 'stale no backup promise',
  owner: agent,
  createdAt: '2026-04-23T00:00:00.000Z',
  status: 'in_progress',
}));

function sign(method, path, body = '') {
  const ts = String(Date.now());
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const payload = [ts, nonce, method.toUpperCase(), path, body].join('.');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { ts, nonce, sig };
}

async function signedRequest(method, path, qs = '', body = '') {
  const { ts, nonce, sig } = sign(method, path, body);
  const res = await fetch(base + path + qs, {
    method,
    headers: {
      'x-bridge-timestamp': ts,
      'x-bridge-nonce': nonce,
      'x-bridge-signature': sig,
      ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}),
    },
    body: method !== 'GET' ? body : undefined,
  });
  return { status: res.status, text: await res.text() };
}

try {
  console.log('WATCHDOG', await signedRequest('POST', '/api/watchdog', '', ''));
  console.log('WAKE', await signedRequest('GET', '/api/wake-queue'));
  console.log('OUTBOX', await signedRequest('GET', '/api/outbox', '?limit=20'));
  console.log('STATUS', await signedRequest('GET', '/api/agent-status'));
  console.log('PROMISE', await signedRequest('GET', '/api/promise'));
} finally {
  await redis.hDel('agent-bridge:agent-status', agent);
  await redis.hDel('agent-bridge:promises', promiseId);
  await redis.quit();
}
