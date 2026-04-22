import { createClient } from "redis";

export type WakeItem = {
  id: string;
  targetAgent: string;
  kind: string;
  relatedId?: string;
  priority?: string;
  createdAt: string;
  consumedAt?: string;
  consumeResult?: string;
  note?: string;
};

const WAKE_KEY = "agent-bridge:wake-queue";
let redisPromise: Promise<ReturnType<typeof createClient>> | null = null;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function redis() {
  if (!redisPromise) {
    const client = createClient({ url: requiredEnv("REDIS_URL") });
    redisPromise = client.connect().then(() => client);
  }
  return redisPromise;
}

export async function readWakeQueue() {
  const client = await redis();
  const raw = await client.get(WAKE_KEY);
  const items = raw ? (JSON.parse(raw) as WakeItem[]) : [];
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function appendWakeItem(input: WakeItem) {
  const items = await readWakeQueue();
  items.push(input);
  const client = await redis();
  await client.set(WAKE_KEY, JSON.stringify(items));
  return input;
}

export function makeWakeId() {
  return `WAKE-${Date.now()}`;
}
