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
  const raw = await client.hGetAll(PROMISE_KEY);
  const items = Object.values(raw).map((value) => JSON.parse(value) as PromiseItem);
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function upsertPromise(input: PromiseItem) {
  const client = await redis();
  await client.hSet(PROMISE_KEY, input.id, JSON.stringify(input));
  return input;
}

export function makePromiseId() {
  return `PROMISE-${Date.now()}`;
}
