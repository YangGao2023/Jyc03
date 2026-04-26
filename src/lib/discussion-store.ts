import { createClient } from "redis";

export type DiscussionStatus = "open" | "deciding" | "closed";

export type DiscussionThread = {
  id: string;
  title: string;
  prompt: string;
  participants: string[];
  status: DiscussionStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  summary?: string;
};

const DISCUSSION_KEY = "agent-bridge:discussion-threads";
let redisPromise: Promise<ReturnType<typeof createClient>> | null = null;

type DiscussionMap = Record<string, DiscussionThread>;

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

async function readMap(client: Awaited<ReturnType<typeof redis>>) {
  const keyType = await client.type(DISCUSSION_KEY);
  if (keyType === "none") return {} as DiscussionMap;
  if (keyType === "hash") {
    const raw = await client.hGetAll(DISCUSSION_KEY);
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, JSON.parse(value) as DiscussionThread]));
  }
  if (keyType === "string") {
    const raw = await client.get(DISCUSSION_KEY);
    return raw ? (JSON.parse(raw) as DiscussionMap) : ({} as DiscussionMap);
  }
  throw new Error(`Unsupported Redis type for ${DISCUSSION_KEY}: ${keyType}`);
}

function sortThreads(items: DiscussionThread[]) {
  return items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function readDiscussionThreads() {
  const client = await redis();
  return sortThreads(Object.values(await readMap(client)));
}

export async function readDiscussionThread(id: string) {
  const threadId = String(id || "").trim();
  if (!threadId) return null;
  const client = await redis();
  const keyType = await client.type(DISCUSSION_KEY);
  if (keyType === "string") {
    const map = await readMap(client);
    return map[threadId] || null;
  }
  const raw = await client.hGet(DISCUSSION_KEY, threadId);
  return raw ? (JSON.parse(raw) as DiscussionThread) : null;
}

export async function upsertDiscussionThread(input: Omit<DiscussionThread, "createdAt" | "updatedAt"> & Partial<Pick<DiscussionThread, "createdAt" | "updatedAt">>) {
  const client = await redis();
  const keyType = await client.type(DISCUSSION_KEY);
  const existingMap = keyType === "string" ? await readMap(client) : null;
  const existing = existingMap?.[input.id] ?? (await client.hGet(DISCUSSION_KEY, input.id).then((v) => (v ? (JSON.parse(v) as DiscussionThread) : null)).catch(() => null));

  const nextThread: DiscussionThread = {
    id: input.id,
    title: input.title,
    prompt: input.prompt,
    participants: [...new Set(input.participants.filter(Boolean))],
    status: input.status,
    createdBy: input.createdBy,
    summary: input.summary,
    createdAt: existing?.createdAt || input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };

  if (keyType === "string") {
    const map = existingMap || {};
    map[nextThread.id] = nextThread;
    await client.set(DISCUSSION_KEY, JSON.stringify(map));
    return nextThread;
  }

  await client.hSet(DISCUSSION_KEY, nextThread.id, JSON.stringify(nextThread));
  return nextThread;
}
