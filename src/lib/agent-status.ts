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

const STATUS_KEY = "agent-bridge:agent-status";
let redisPromise: Promise<ReturnType<typeof createClient>> | null = null;

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

export async function readAgentStatuses() {
  const client = await redis();
  const raw = await client.hGetAll(STATUS_KEY);
  const items = Object.values(raw).map((value) => JSON.parse(value) as AgentStatus);
  return items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
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
  await client.hSet(STATUS_KEY, nextStatus.agent, JSON.stringify(nextStatus));
  return nextStatus;
}
