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

export async function readPromises() {
  const client = await redis();
  const raw = await client.get(PROMISE_KEY);
  const items = raw ? (JSON.parse(raw) as PromiseItem[]) : [];
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function upsertPromise(input: PromiseItem) {
  const items = await readPromises();
  const filtered = items.filter((item) => item.id !== input.id);
  filtered.push(input);
  const client = await redis();
  await client.set(PROMISE_KEY, JSON.stringify(filtered));
  return input;
}

export function makePromiseId() {
  return `PROMISE-${Date.now()}`;
}
