import { createClient } from "redis";

export type EventResult = "pending" | "ok" | "failed" | "skipped";

export type EventChainItem = {
  id: string;
  timestamp: string;
  actor: string;
  target?: string;
  promiseId?: string;
  type:
    | "promise_created"
    | "promise_completed"
    | "promise_cancelled"
    | "owner_handoff"
    | "alert_triggered"
    | "alert_resolved"
    | "proof_generated"
    | "stale_detected";
  result: EventResult;
  needsOwnerAttention?: boolean;
  summary?: string;
};

const EVENT_KEY = "agent-bridge:event-chain";
let redisPromise: Promise<ReturnType<typeof createClient>> | null = null;

type EventStoreMap = Record<string, EventChainItem>;

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

function sortEvents(items: EventChainItem[]) {
  return items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

function parseLegacyEventString(raw: string | null): EventStoreMap {
  if (!raw) {
    return {} as EventStoreMap;
  }

  const parsed = JSON.parse(raw) as EventChainItem[] | EventStoreMap;
  if (Array.isArray(parsed)) {
    return Object.fromEntries(parsed.map((item) => [item.id, item]));
  }

  return parsed;
}

async function readEventMap(client: Awaited<ReturnType<typeof redis>>) {
  const keyType = await client.type(EVENT_KEY);
  if (keyType === "none") {
    return {} as EventStoreMap;
  }

  if (keyType === "hash") {
    const raw = await client.hGetAll(EVENT_KEY);
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, JSON.parse(value) as EventChainItem]));
  }

  if (keyType === "string") {
    return parseLegacyEventString(await client.get(EVENT_KEY));
  }

  throw new Error(`Unsupported Redis type for ${EVENT_KEY}: ${keyType}`);
}

export async function readEventChain() {
  const client = await redis();
  const items = Object.values(await readEventMap(client));
  return sortEvents(items);
}

export async function appendEvent(input: Omit<EventChainItem, "id" | "timestamp"> & Partial<Pick<EventChainItem, "id" | "timestamp">>) {
  const client = await redis();
  const item: EventChainItem = {
    id: input.id || `EVENT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: input.timestamp || new Date().toISOString(),
    actor: input.actor,
    target: input.target,
    promiseId: input.promiseId,
    type: input.type,
    result: input.result,
    needsOwnerAttention: input.needsOwnerAttention,
    summary: input.summary,
  };

  const keyType = await client.type(EVENT_KEY);
  if (keyType === "string") {
    const map = await readEventMap(client);
    map[item.id] = item;
    await client.set(EVENT_KEY, JSON.stringify(map));
    return item;
  }

  await client.hSet(EVENT_KEY, item.id, JSON.stringify(item));
  return item;
}
