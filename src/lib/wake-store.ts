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
  const raw = await client.hGetAll(WAKE_KEY);
  const items = Object.values(raw).map((value) => JSON.parse(value) as WakeItem);
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function upsertWakeItem(input: WakeItem) {
  const client = await redis();
  await client.hSet(WAKE_KEY, input.id, JSON.stringify(input));
  return input;
}

export async function appendWakeItem(input: WakeItem) {
  return upsertWakeItem(input);
}

export function makeWakeId() {
  return `WAKE-${Date.now()}`;
}
