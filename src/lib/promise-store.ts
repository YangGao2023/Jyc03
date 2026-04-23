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

const PROMISE_KEY = "agent-bridge:promises";
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

async function readPromiseMap(client: Awaited<ReturnType<typeof redis>>) {
  const keyType = await client.type(PROMISE_KEY);
  if (keyType === "none") {
    return {} as PromiseStoreMap;
  }

  if (keyType === "hash") {
    const raw = await client.hGetAll(PROMISE_KEY);
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, JSON.parse(value) as PromiseItem]));
  }

  if (keyType === "string") {
    return parseLegacyPromiseString(await client.get(PROMISE_KEY));
  }

  throw new Error(`Unsupported Redis type for ${PROMISE_KEY}: ${keyType}`);
}

export async function readPromises() {
  const client = await redis();
  const items = Object.values(await readPromiseMap(client));
  return sortPromises(items);
}

export async function upsertPromise(input: PromiseItem) {
  const client = await redis();
  const keyType = await client.type(PROMISE_KEY);

  if (keyType === "string") {
    const map = await readPromiseMap(client);
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
