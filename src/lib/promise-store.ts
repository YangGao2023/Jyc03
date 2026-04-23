import { createClient } from "redis";

export type PromiseStatus = "promised" | "acknowledged" | "in_progress" | "blocked" | "handed_off" | "completed" | "expired";

export type PromiseItem = {
  id: string;
  kind: string;
  title: string;
  description?: string;
  owner: string;
  backup?: string;
  createdBy?: string;
  createdAt: string;
  dueAt?: string;
  nextCheckAt?: string;
  status: PromiseStatus;
  blockedReason?: string;
  requiredProof?: string[];
  latestProofSummary?: string;
  latestProgressAt?: string;
  relatedTaskId?: string;
  sourceChannel?: string;
  sourceMessageId?: string;
};

const PROMISE_KEY = "agent-bridge:v2:promises";
const LEGACY_PROMISE_KEY = "agent-bridge:promises";
let redisPromise: Promise<ReturnType<typeof createClient>> | null = null;

type PromiseStoreMap = Record<string, PromiseItem>;

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

function sortPromises(items: PromiseItem[]) {
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function parseLegacyPromiseString(raw: string | null): PromiseStoreMap {
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as PromiseItem[] | PromiseStoreMap;
  if (Array.isArray(parsed)) {
    return Object.fromEntries(parsed.map((item) => [item.id, item]));
  }

  return parsed;
}

async function readPromiseMapForKey(client: Awaited<ReturnType<typeof redis>>, key: string) {
  const keyType = await client.type(key);
  if (keyType === "none") {
    return {} as PromiseStoreMap;
  }

  if (keyType === "hash") {
    const raw = await client.hGetAll(key);
    return Object.fromEntries(Object.entries(raw).map(([entryKey, value]) => [entryKey, JSON.parse(value) as PromiseItem]));
  }

  if (keyType === "string") {
    return parseLegacyPromiseString(await client.get(key));
  }

  throw new Error(`Unsupported Redis type for ${key}: ${keyType}`);
}

async function readLegacyPromiseMap(client: Awaited<ReturnType<typeof redis>>) {
  try {
    return await readPromiseMapForKey(client, LEGACY_PROMISE_KEY);
  } catch {
    return {} as PromiseStoreMap;
  }
}

export async function readPromises() {
  const client = await redis();
  const current = await readPromiseMapForKey(client, PROMISE_KEY);
  const items = Object.values(Object.keys(current).length > 0 ? current : await readLegacyPromiseMap(client));
  return sortPromises(items);
}

export async function upsertPromise(input: PromiseItem) {
  const client = await redis();
  const keyType = await client.type(PROMISE_KEY);

  if (keyType === "string") {
    const map = await readPromiseMapForKey(client, PROMISE_KEY);
    map[input.id] = input;
    await client.set(PROMISE_KEY, JSON.stringify(map));
    return input;
  }

  await client.hSet(PROMISE_KEY, input.id, JSON.stringify(input));
  return input;
}

export function makePromiseId() {
  return `PROMISE-${Date.now()}`;
}
