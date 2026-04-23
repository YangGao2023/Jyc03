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

type WakeStoreMap = Record<string, WakeItem>;

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

function sortWakeItems(items: WakeItem[]) {
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function parseLegacyWakeString(raw: string | null): WakeStoreMap {
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as WakeItem[] | WakeStoreMap;
  if (Array.isArray(parsed)) {
    return Object.fromEntries(parsed.map((item) => [item.id, item]));
  }

  return parsed;
}

async function readWakeMap(client: Awaited<ReturnType<typeof redis>>) {
  const keyType = await client.type(WAKE_KEY);
  if (keyType === "none") {
    return {} as WakeStoreMap;
  }

  if (keyType === "hash") {
    const raw = await client.hGetAll(WAKE_KEY);
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, JSON.parse(value) as WakeItem]));
  }

  if (keyType === "string") {
    return parseLegacyWakeString(await client.get(WAKE_KEY));
  }

  throw new Error(`Unsupported Redis type for ${WAKE_KEY}: ${keyType}`);
}

export async function readWakeQueue() {
  const client = await redis();
  const items = Object.values(await readWakeMap(client));
  return sortWakeItems(items);
}

export async function upsertWakeItem(input: WakeItem) {
  const client = await redis();
  const keyType = await client.type(WAKE_KEY);

  if (keyType === "string") {
    const map = await readWakeMap(client);
    map[input.id] = input;
    await client.set(WAKE_KEY, JSON.stringify(map));
    return input;
  }

  await client.hSet(WAKE_KEY, input.id, JSON.stringify(input));
  return input;
}

export async function appendWakeItem(input: WakeItem) {
  return upsertWakeItem(input);
}

export function makeWakeId() {
  return `WAKE-${Date.now()}`;
}
