import crypto from "node:crypto";
import { createClient } from "redis";

export type BridgeMessage = {
  id: string;
  from: string;
  to: string;
  text: string;
  kind: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

type QueueName = "inbox" | "outbox";

type ConsumeQueueOptions = {
  limit?: number;
  consume?: boolean;
  recipient?: string;
};

const NONCE_TTL_SECONDS = 60 * 5;
const MAX_SKEW_MS = 1000 * 60 * 5;
let redisPromise: Promise<ReturnType<typeof createClient>> | null = null;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function normalizeRecipient(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function matchesRecipient(message: BridgeMessage, recipient?: string) {
  if (!recipient) {
    return true;
  }
  return normalizeRecipient(message.to) === normalizeRecipient(recipient);
}

export function bridgeSecret() {
  return requiredEnv("AGENT_BRIDGE_HMAC_SECRET");
}

async function redis() {
  if (!redisPromise) {
    const client = createClient({ url: requiredEnv("REDIS_URL") });
    redisPromise = client.connect().then(() => client);
  }
  return redisPromise;
}

function queueKey(name: QueueName) {
  return `agent-bridge:${name}`;
}

function nonceKey(nonce: string) {
  return `agent-bridge:nonce:${nonce}`;
}

export async function readQueue(name: QueueName) {
  const client = await redis();
  const raw = await client.get(queueKey(name));
  return raw ? (JSON.parse(raw) as BridgeMessage[]) : [];
}

export async function writeQueue(name: QueueName, messages: BridgeMessage[]) {
  const client = await redis();
  await client.set(queueKey(name), JSON.stringify(messages));
}

export async function enqueueMessage(
  name: QueueName,
  message: Omit<BridgeMessage, "id" | "createdAt"> & Partial<Pick<BridgeMessage, "id" | "createdAt">>,
) {
  const nextMessage: BridgeMessage = {
    id: message.id || crypto.randomUUID(),
    createdAt: message.createdAt || new Date().toISOString(),
    kind: message.kind || "text",
    from: message.from,
    to: message.to,
    text: message.text,
    meta: message.meta,
  };

  const queue = await readQueue(name);
  queue.push(nextMessage);
  await writeQueue(name, queue);
  return nextMessage;
}

export async function consumeQueue(name: QueueName, options: ConsumeQueueOptions = {}) {
  const limit = Math.max(1, Math.min(50, Number(options.limit || 20)));
  const consume = options.consume === true;
  const recipient = options.recipient?.trim();
  const queue = await readQueue(name);
  const items = queue.filter((message) => matchesRecipient(message, recipient)).slice(0, limit);

  if (consume && items.length > 0) {
    const consumedIds = new Set(items.map((item) => item.id));
    const remaining = queue.filter((message) => !consumedIds.has(message.id));
    await writeQueue(name, remaining);
  }

  return items;
}

export async function verifyBridgeRequest(request: Request) {
  const timestamp = request.headers.get("x-bridge-timestamp") || "";
  const nonce = request.headers.get("x-bridge-nonce") || "";
  const signature = request.headers.get("x-bridge-signature") || "";

  if (!timestamp || !nonce || !signature) {
    throw new Error("Missing HMAC headers");
  }

  const millis = Number(timestamp);
  if (!Number.isFinite(millis)) {
    throw new Error("Invalid timestamp");
  }

  if (Math.abs(Date.now() - millis) > MAX_SKEW_MS) {
    throw new Error("Timestamp outside allowed window");
  }

  const bodyText = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  const payload = [timestamp, nonce, request.method.toUpperCase(), new URL(request.url).pathname, bodyText].join(".");
  const expected = crypto.createHmac("sha256", bridgeSecret()).update(payload).digest("hex");
  if (signature.length !== expected.length) {
    throw new Error("Invalid signature");
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"))) {
    throw new Error("Invalid signature");
  }

  const client = await redis();
  const replay = await client.set(nonceKey(nonce), "1", { NX: true, EX: NONCE_TTL_SECONDS });
  if (replay !== "OK") {
    throw new Error("Replay detected");
  }

  return { bodyText };
}

export function parseMessageBody(bodyText: string) {
  if (!bodyText) {
    return {} as Record<string, unknown>;
  }

  return JSON.parse(bodyText) as Record<string, unknown>;
}
