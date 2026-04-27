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
  systemState?: string;
  taskProgress?: string;
  currentTask?: string;
  realCtxUsage?: number;
  lastHeartbeat?: string;
  typingSince?: string;
  errorDetail?: string;
  modelName?: string;
  ctxUsed?: number;
  ctxTotal?: number;
  tokenThisRound?: number;
};

export type AgentStatusHistoryPoint = {
  agent: string;
  capturedAt: string;
  status: string;
  systemState?: string;
  realCtxUsage?: number;
  lastHeartbeat?: string;
  taskProgress?: string;
  currentTask?: string;
};

const STATUS_KEY = "agent-bridge:v2:agent-status";
const STATUS_HISTORY_KEY = "agent-bridge:v2:agent-status-history";
const LEGACY_STATUS_KEY = "agent-bridge:agent-status";
const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;
const HISTORY_MIN_INTERVAL_MS = 5 * 60 * 1000;
const HISTORY_MAX_POINTS = 2000;
let redisPromise: Promise<ReturnType<typeof createClient>> | null = null;

type StatusStoreMap = Record<string, AgentStatus>;

function parseStatusItem(raw: string): AgentStatus | null {
  try {
    return normalizeStatus(JSON.parse(raw) as AgentStatus);
  } catch {
    return null;
  }
}

function parseHistoryItems(raw: string): AgentStatusHistoryPoint[] {
  try {
    return (JSON.parse(raw) as AgentStatusHistoryPoint[]).map((item) => normalizeHistoryPoint(item));
  } catch {
    return [];
  }
}

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

function normalizeNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeStatus(item: AgentStatus) {
  return {
    ...item,
    realCtxUsage: normalizeNumber(item.realCtxUsage),
    ctxUsed: normalizeNumber(item.ctxUsed),
    ctxTotal: normalizeNumber(item.ctxTotal),
    tokenThisRound: normalizeNumber(item.tokenThisRound),
  } satisfies AgentStatus;
}

function normalizeHistoryPoint(item: AgentStatusHistoryPoint) {
  return {
    ...item,
    realCtxUsage: normalizeNumber(item.realCtxUsage),
  } satisfies AgentStatusHistoryPoint;
}

function parseLegacyStatusString(raw: string | null): StatusStoreMap {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as AgentStatus[] | StatusStoreMap;
    if (Array.isArray(parsed)) {
      return Object.fromEntries(parsed.map((item) => [item.agent, normalizeStatus(item)]));
    }

    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, normalizeStatus(value)]));
  } catch {
    return {} as StatusStoreMap;
  }
}

async function readStatusMapForKey(client: Awaited<ReturnType<typeof redis>>, key: string) {
  const keyType = await client.type(key);
  if (keyType === "none") {
    return {} as StatusStoreMap;
  }

  if (keyType === "hash") {
    const raw = await client.hGetAll(key);
    return Object.fromEntries(
      Object.entries(raw)
        .map(([entryKey, value]) => [entryKey, parseStatusItem(value)] as const)
        .filter((entry): entry is readonly [string, AgentStatus] => Boolean(entry[1])),
    );
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

async function appendStatusHistory(client: Awaited<ReturnType<typeof redis>>, status: AgentStatus) {
  const capturedAt = status.updatedAt || new Date().toISOString();
  const existingRaw = await client.hGet(STATUS_HISTORY_KEY, status.agent);
  const existing = existingRaw ? parseHistoryItems(existingRaw) : [];

  const lastPoint = existing.at(-1);
  const capturedAtMs = Date.parse(capturedAt);
  const shouldAppend = !lastPoint
    || !Number.isFinite(Date.parse(lastPoint.capturedAt))
    || capturedAtMs - Date.parse(lastPoint.capturedAt) >= HISTORY_MIN_INTERVAL_MS
    || lastPoint.realCtxUsage !== status.realCtxUsage
    || String(lastPoint.systemState || "") !== String(status.systemState || "")
    || String(lastPoint.status || "") !== String(status.status || "")
    || String(lastPoint.taskProgress || "") !== String(status.taskProgress || "")
    || String(lastPoint.currentTask || "") !== String(status.currentTask || "");

  if (!shouldAppend) {
    return;
  }

  const nextPoint = normalizeHistoryPoint({
    agent: status.agent,
    capturedAt,
    status: status.status,
    systemState: status.systemState,
    realCtxUsage: status.realCtxUsage,
    lastHeartbeat: status.lastHeartbeat,
    taskProgress: status.taskProgress,
    currentTask: status.currentTask,
  });

  const cutoff = capturedAtMs - HISTORY_RETENTION_MS;
  const trimmed = [...existing, nextPoint]
    .filter((item) => {
      const ts = Date.parse(item.capturedAt);
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .slice(-HISTORY_MAX_POINTS);

  await client.hSet(STATUS_HISTORY_KEY, status.agent, JSON.stringify(trimmed));
}

export async function readAgentStatuses() {
  const client = await redis();
  const current = await readStatusMapForKey(client, STATUS_KEY);
  const items = Object.values(Object.keys(current).length > 0 ? current : await readLegacyStatusMap(client));
  return sortStatuses(items);
}

export async function readAgentStatusHistory(options?: { hours?: number; limitPerAgent?: number }) {
  const client = await redis();
  const hours = Math.max(1, Math.min(24 * 7, options?.hours || 24));
  const limitPerAgent = Math.max(12, Math.min(HISTORY_MAX_POINTS, options?.limitPerAgent || 288));
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const raw = await client.hGetAll(STATUS_HISTORY_KEY);

  return Object.fromEntries(
    Object.entries(raw).map(([agent, value]) => {
      const items = parseHistoryItems(value)
        .filter((item) => {
          const ts = Date.parse(item.capturedAt);
          return Number.isFinite(ts) && ts >= cutoff;
        })
        .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
        .slice(-limitPerAgent);
      return [agent, items];
    }),
  ) as Record<string, AgentStatusHistoryPoint[]>;
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
    systemState: input.systemState,
    taskProgress: input.taskProgress,
    currentTask: input.currentTask,
    realCtxUsage: normalizeNumber(input.realCtxUsage),
    lastHeartbeat: input.lastHeartbeat,
    typingSince: input.typingSince,
    errorDetail: input.errorDetail,
    modelName: input.modelName,
    ctxUsed: normalizeNumber(input.ctxUsed),
    ctxTotal: normalizeNumber(input.ctxTotal),
    tokenThisRound: normalizeNumber(input.tokenThisRound),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };

  const client = await redis();
  const keyType = await client.type(STATUS_KEY);

  if (keyType === "string") {
    const map = await readStatusMapForKey(client, STATUS_KEY);
    map[nextStatus.agent] = nextStatus;
    await client.set(STATUS_KEY, JSON.stringify(map));
  } else {
    await client.hSet(STATUS_KEY, nextStatus.agent, JSON.stringify(nextStatus));
  }

  await appendStatusHistory(client, nextStatus);
  return nextStatus;
}
