import { createClient } from "redis";

export type ProofItem = {
  id: string;
  promiseId: string;
  proofType: string;
  proofValue?: string;
  proofPath?: string;
  createdAt: string;
  createdBy?: string;
  summary?: string;
};

const PROOF_KEY = "agent-bridge:proofs";
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

export async function readProofs() {
  const client = await redis();
  const raw = await client.get(PROOF_KEY);
  const items = raw ? (JSON.parse(raw) as ProofItem[]) : [];
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function appendProof(input: ProofItem) {
  const items = await readProofs();
  items.push(input);
  const client = await redis();
  await client.set(PROOF_KEY, JSON.stringify(items));
  return input;
}

export function makeProofId() {
  return `PROOF-${Date.now()}`;
}
