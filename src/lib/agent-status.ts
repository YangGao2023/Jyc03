import { createClient } from "redis";

export type AgentStatus = {
  agent: string;
  role?: string;
  status: string;
  summary?: string;
  owner?: string;
  backup?: string;
  taskId?: string;
  updatedAt: string;
  source?: string;
};

const STATUS_KEY = "agent-bridge:v2:agent-status";
const LEGACY_STATUS_KEY = "agent-bridge:agent-status";
let redisPromise: Promise<ReturnType<typeof createClient>> | null = null;

type StatusStoreMap = Record<string, AgentStatus>;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function redis() {
  if (!redisPromise) {
    const client = createClient({ url: requiredEnv("REDIS_URL") });
    redisPromise = client.connect().then(() => client);
  }
  return redisPromise;
}

function sortStatuses(items: AgentStatus[]) {
  return items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function parseLegacyStatusString(raw: string | null): StatusStoreMap {
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as AgentStatus[] | StatusStoreMap;
  if (Array.isArray(parsed)) {
    return Object.fromEntries(parsed.map((item) => [item.agent, item]));
  }

  return parsed;
}

async function readStatusMapForKey(client: Awaited<ReturnType<typeof redis>>, key: string) {
  const keyType = await client.type(key);
  if (keyType === "none") {
    return {} as StatusStoreMap;
  }

  if (keyType === "hash") {
    const raw = await client.hGetAll(key);
    return Object.fromEntries(Object.entries(raw).map(([entryKey, value]) => [entryKey, JSON.parse(value) as AgentStatus]));
  }

  if (keyType === "string") {
    return parseLegacyStatusString(await client.get(key));
  }

  throw new Error(`Unsupported Redis type for ${key}: ${keyType}`);
}

async function readLegacyStatusMap(client: Awaited<ReturnType<typeof redis>>) {
  try {
    return await readStatusMapForKey(client, LEGACY_STATUS_KEY);
  } catch {
    return {} as StatusStoreMap;
  }
}

export async function readAgentStatuses() {
  const client = await redis();
  const current = await readStatusMapForKey(client, STATUS_KEY);
  const items = Object.values(Object.keys(current).length > 0 ? current : await readLegacyStatusMap(client));
  return sortStatuses(items);
}

export async function upsertAgentStatus(input: Omit<AgentStatus, "updatedAt"> & Partial<Pick<AgentStatus, "updatedAt">>) {
  const nextStatus: AgentStatus = {
    agent: input.agent,
    role: input.role,
    status: input.status || "standby",
    summary: input.summary,
    owner: input.owner,
    backup: input.backup,
    taskId: input.taskId,
    source: input.source,
    updatedAt: input.updatedAt || new Date().toISOString(),
  };

  const client = await redis();
  const keyType = await client.type(STATUS_KEY);

  if (keyType === "string") {
    const map = await readStatusMapForKey(client, STATUS_KEY);
    map[nextStatus.agent] = nextStatus;
    await client.set(STATUS_KEY, JSON.stringify(map));
    return nextStatus;
  }

  await client.hSet(STATUS_KEY, nextStatus.agent, JSON.stringify(nextStatus));
  return nextStatus;
}
