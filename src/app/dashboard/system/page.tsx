import path from "node:path";
import { homedir } from "node:os";
import net from "node:net";
import { revalidatePath } from "next/cache";
import { DashboardCard, DashboardCardTitle, DashboardPageHeader } from "../components";
import { ConfirmSubmitButton } from "../ConfirmSubmitButton";
import { safeRead } from "@/lib/fs-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { enqueueMessage, readQueue, writeQueue } from "@/lib/agent-bridge";
import { readAgentStatuses } from "@/lib/agent-status";
import { cleanDiscussionReplyText, deriveDiscussionStatus, discussionParticipantStates as buildDiscussionParticipantStates, extractTopicId, isFinalDiscussionReply, typingParticipants as buildTypingParticipants } from "@/lib/discussion-semantics";
import { readDiscussionThreads, upsertDiscussionThread, type DiscussionStatus, type DiscussionThread } from "@/lib/discussion-store";
import { appendEvent, clearEventChain, readEventChain } from "@/lib/event-store";
import { formatEasternTime } from "@/lib/time";
import { displayTaskEventType, parseEventStream, taskEventTone } from "@/lib/task-board";
import { readWakeQueue } from "@/lib/wake-store";
import { computeWatchdogAlerts } from "@/lib/watchdog";
import { readPromises } from "@/lib/promise-store";

const profileSpecs = [
  {
    key: "asan",
    name: "阿三",
    profile: "A3",
    configPath: path.join(homedir(), ".openclaw-A3", "openclaw.json"),
    fallbackPort: 18789,
  },
] as const;

type BridgeRecipientSummary = {
  recipient: string;
  count: number;
};

type SentHistoryItem = {
  id: string;
  commandId?: string;
  createdAt: string;
  to: string;
  kind: string;
  text: string;
  status: "pending" | "receipt" | "done";
  relatedReceipt?: Awaited<ReturnType<typeof readQueue>>[number];
  relatedResult?: Awaited<ReturnType<typeof readQueue>>[number];
};

type DiscussionTimelineItem = {
  id: string;
  createdAt: string;
  from: string;
  to: string;
  kind: string;
  text: string;
  lane: "outbox" | "inbox";
  status: string;
  stage: "processing" | "result";
};

type DiscussionParticipantState = {
  participant: string;
  state: "replied" | "pending";
};

const COMMAND_RECIPIENT_OPTIONS = [
  { value: "阿三", label: "阿三（可执行）" },
  { value: "零号", label: "零号（云端）" },
] as const;

async function sendCommandAction(formData: FormData) {
  "use server";

  const to = String(formData.get("to") || "").trim();
  const text = String(formData.get("text") || "").trim();
  const kind = String(formData.get("kind") || "command").trim() || "command";

  if (!to || !text) {
    return;
  }

  if (!COMMAND_RECIPIENT_OPTIONS.some((item) => item.value === to)) {
    return;
  }

  const message = await enqueueMessage("outbox", {
    from: "YANG",
    to,
    text,
    kind,
    meta: { source: "owner-dashboard" },
  });

  await appendEvent({
    actor: "YANG",
    target: to,
    promiseId: message.id,
    type: "promise_created",
    result: "ok",
    summary: `Owner sent ${kind} command via website: ${message.text}`,
  });

  revalidatePath("/dashboard/system");
}

async function createDiscussionAction(formData: FormData) {
  "use server";

  const title = String(formData.get("title") || "").trim();
  const prompt = String(formData.get("prompt") || "").trim();
  const participants = COMMAND_RECIPIENT_OPTIONS.map((item) => item.value);
  if (!title || !prompt) {
    return;
  }

  const threadId = `topic-${Date.now()}`;
  await upsertDiscussionThread({
    id: threadId,
    title,
    prompt,
    participants,
    status: "open",
    createdBy: "YANG",
    summary: "等待阿三与零号围绕同一问题开始讨论",
  });

  for (const to of participants) {
    const message = await enqueueMessage("outbox", {
      from: "YANG",
      to,
      kind: "discussion",
      text: prompt,
      meta: {
        source: "owner-discussion",
        topicId: threadId,
        topicTitle: title,
        discussionStatus: "open",
        participants,
      },
    });
    await appendEvent({
      actor: "YANG",
      target: to,
      promiseId: message.id,
      type: "promise_created",
      result: "ok",
      summary: `Owner opened discussion via website: ${title} :: ${prompt}`,
    });
  }

  revalidatePath("/dashboard/system");
}

async function updateDiscussionStatusAction(formData: FormData) {
  "use server";

  const threadId = String(formData.get("threadId") || "").trim();
  const nextStatus = String(formData.get("status") || "").trim() as DiscussionStatus;
  const title = String(formData.get("title") || "").trim();
  const prompt = String(formData.get("prompt") || "").trim();
  const participants = String(formData.get("participants") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!threadId || !title || !prompt || !participants.length || !["open", "deciding", "closed"].includes(nextStatus)) {
    return;
  }

  await upsertDiscussionThread({
    id: threadId,
    title,
    prompt,
    participants,
    status: nextStatus,
    createdBy: "YANG",
    summary: nextStatus === "closed" ? "讨论已收口，不再继续自动来回" : `讨论状态已切换到 ${nextStatus}`,
  });

  if (nextStatus === "closed") {
    const outbox = await readQueue("outbox");
    await writeQueue(
      "outbox",
      outbox.filter((message) => extractTopicId((message.meta || null) as Record<string, unknown> | null) !== threadId),
    );
  }

  await appendEvent({
    actor: "YANG",
    target: participants.join(", "),
    promiseId: threadId,
    type: "decision",
    result: "ok",
    summary: `Discussion ${threadId} status -> ${nextStatus}`,
  });

  revalidatePath("/dashboard/system");
}

async function clearCommandCenterHistoryAction() {
  "use server";

  await Promise.all([
    writeQueue("inbox", []),
    writeQueue("outbox", []),
    clearEventChain(),
  ]);

  revalidatePath("/dashboard/system");
}

function getGatewayPort(configPath: string, fallbackPort: number) {
  try {
    const raw = safeRead(configPath);
    if (!raw) return fallbackPort;
    const parsed = JSON.parse(raw);
    return Number(parsed?.gateway?.port || fallbackPort);
  } catch {
    return fallbackPort;
  }
}

function probePort(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(1200);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function summarizeRecipients(messages: Awaited<ReturnType<typeof readQueue>>): BridgeRecipientSummary[] {
  const buckets = new Map<string, number>();
  for (const message of messages) {
    const key = message.to || "未指定";
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()]
    .map(([recipient, count]) => ({ recipient, count }))
    .sort((a, b) => b.count - a.count);
}

function displayBridgeKind(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "voice") return "语音任务";
  if (normalized === "command") return "命令";
  if (normalized === "text") return "文本";
  if (normalized === "receipt") return "已收到";
  if (normalized === "result") return "已完成";
  if (normalized === "error") return "失败";
  return value || "未知";
}

function bridgeKindBadge(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "result") return "bg-emerald-100 text-emerald-800";
  if (normalized === "receipt") return "bg-amber-100 text-amber-800";
  if (normalized === "error") return "bg-rose-100 text-rose-800";
  if (normalized === "voice") return "bg-fuchsia-100 text-fuchsia-800";
  if (normalized === "command") return "bg-sky-100 text-sky-800";
  if (normalized === "text") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function bridgeCardTone(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "result") return "border-emerald-300 bg-emerald-50/40";
  if (normalized === "receipt") return "border-amber-300 bg-amber-50/40";
  if (normalized === "error") return "border-rose-300 bg-rose-50/40";
  return fallback;
}

function statusBadge(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "busy") return "bg-amber-100 text-amber-800";
  if (normalized === "blocked") return "bg-rose-100 text-rose-800";
  if (normalized === "offline") return "bg-slate-200 text-slate-700";
  return "bg-emerald-100 text-emerald-800";
}

function displayRelativeAge(iso: string) {
  const diffMs = Date.now() - Date.parse(iso);
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return "刚刚更新";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.round(diffMin / 60);
  return `${diffHour} 小时前`;
}

function isStale(iso: string) {
  return Date.now() - Date.parse(iso) > 30 * 60 * 1000;
}

function keepLatestResultPerCommand(messages: Awaited<ReturnType<typeof readQueue>>) {
  const latestResultByCommandId = new Map<string, (typeof messages)[number]>();

  for (const message of messages) {
    if (extractTopicId((message.meta || null) as Record<string, unknown> | null)) {
      continue;
    }
    const commandId = String(message.meta?.commandId || "").trim();
    if (String(message.kind || "").toLowerCase() !== "result" || !commandId) {
      continue;
    }
    latestResultByCommandId.set(commandId, message);
  }

  return messages.filter((message) => {
    if (extractTopicId((message.meta || null) as Record<string, unknown> | null)) {
      return false;
    }
    const commandId = String(message.meta?.commandId || "").trim();
    if (String(message.kind || "").toLowerCase() !== "result" || !commandId) {
      return true;
    }
    return latestResultByCommandId.get(commandId)?.id === message.id;
  });
}

function compactMetaSummary(meta: Record<string, unknown> | null | undefined) {
  if (!meta) return "";
  const parts = [
    meta.commandId ? `commandId: ${String(meta.commandId).slice(0, 8)}` : "",
    meta.stage ? `stage: ${String(meta.stage)}` : "",
    meta.source ? `source: ${String(meta.source)}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function extractCommandTextFromSummary(summary: string) {
  const marker = " via website: ";
  if (!summary.includes(marker)) return summary.trim();
  return summary.slice(summary.indexOf(marker) + marker.length).trim() || summary.trim();
}

function extractCommandKindFromSummary(summary: string) {
  const match = summary.match(/^Owner sent\s+(\w+)\s+command via website:/i);
  return match?.[1]?.toLowerCase() || "command";
}

function summarizeDiscussionStatus(status: DiscussionStatus) {
  if (status === "open") return "开放讨论";
  if (status === "deciding") return "正在收口";
  return "已关闭";
}

function discussionStatusBadge(status: DiscussionStatus) {
  if (status === "open") return "bg-sky-100 text-sky-800";
  if (status === "deciding") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

function discussionClosureSource(thread: DiscussionThread) {
  const summary = String(thread.summary || "").trim();
  if (summary.includes("自动收口")) {
    return { label: "自动收口", tone: "bg-emerald-100 text-emerald-800" };
  }
  if (thread.status === "closed") {
    return { label: "手动收口", tone: "bg-slate-200 text-slate-700" };
  }
  return null;
}

function identityChip(name: string) {
  const normalized = String(name || "").trim();
  if (normalized === "阿三") {
    return { avatar: "三", tone: "bg-sky-100 text-sky-800", avatarTone: "bg-sky-600 text-white" };
  }
  if (normalized === "零号") {
    return { avatar: "零", tone: "bg-emerald-100 text-emerald-800", avatarTone: "bg-emerald-600 text-white" };
  }
  if (normalized === "YANG") {
    return { avatar: "Y", tone: "bg-slate-200 text-slate-800", avatarTone: "bg-slate-800 text-white" };
  }
  return { avatar: normalized.slice(0, 1) || "?", tone: "bg-slate-100 text-slate-700", avatarTone: "bg-slate-500 text-white" };
}

function summarizeMessageTitle(text: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "空内容";
  const firstLine = normalized.split(/\r?\n/, 1)[0].trim();
  if (firstLine.length <= 36) return firstLine;
  return `${firstLine.slice(0, 36)}…`;
}

function emphasizeQuestion(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized) return "空内容";
  if (normalized.length <= 60) return normalized;
  return `${normalized.slice(0, 60)}…`;
}

function buildDiscussionTimeline(thread: DiscussionThread, _outboxMessages: Awaited<ReturnType<typeof readQueue>>, inboxMessages: Awaited<ReturnType<typeof readQueue>>) {
  const topicId = thread.id;
  const entries: DiscussionTimelineItem[] = [];

  for (const message of inboxMessages) {
    const meta = (message.meta || null) as Record<string, unknown> | null;
    if (extractTopicId(meta) !== topicId) continue;

    const isFinal = isFinalDiscussionReply({ kind: message.kind, text: message.text, meta });
    const rawStage = String(meta?.stage || (meta?.commandMeta && typeof meta.commandMeta === "object" ? (meta.commandMeta as Record<string, unknown>).stage : "") || "").trim().toLowerCase();
    const isProcessing = rawStage === "processing";

    if (!isFinal && !isProcessing) continue;

    const cleanedText = isFinal ? cleanDiscussionReplyText(message.text) : String(message.text || "").trim();
    if (!cleanedText) continue;

    entries.push({
      id: message.id,
      createdAt: message.createdAt,
      from: message.from,
      to: message.to,
      kind: message.kind,
      text: cleanedText,
      lane: "inbox",
      status: String(meta?.discussionStatus || (meta?.commandMeta && typeof meta.commandMeta === "object" ? (meta.commandMeta as Record<string, unknown>).discussionStatus : "") || thread.status),
      stage: isFinal ? "result" : "processing",
    });
  }

  return entries.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function buildSentHistory(items: Awaited<ReturnType<typeof readEventChain>>, inboxMessages: Awaited<ReturnType<typeof readQueue>>) {
  const latestReceiptByCommandId = new Map<string, (typeof inboxMessages)[number]>();
  const latestResultByCommandId = new Map<string, (typeof inboxMessages)[number]>();

  for (const message of inboxMessages) {
    if (extractTopicId((message.meta || null) as Record<string, unknown> | null)) {
      continue;
    }
    const commandId = String(message.meta?.commandId || "").trim();
    if (!commandId) continue;
    const kind = String(message.kind || "").trim().toLowerCase();
    if (kind === "receipt") latestReceiptByCommandId.set(commandId, message);
    if (kind === "result") latestResultByCommandId.set(commandId, message);
  }

  return items
    .filter((item) => item.actor === "YANG" && item.type === "promise_created" && (item.target || "") !== "" && !(item.summary || "").startsWith("Owner opened discussion via website:"))
    .map((item) => {
      const relatedReceipt = item.promiseId ? latestReceiptByCommandId.get(item.promiseId) : undefined;
      const relatedResult = item.promiseId ? latestResultByCommandId.get(item.promiseId) : undefined;
      return {
        id: item.id,
        commandId: item.promiseId,
        createdAt: item.timestamp,
        to: item.target || "未指定",
        kind: extractCommandKindFromSummary(item.summary || ""),
        text: extractCommandTextFromSummary(item.summary || ""),
        status: relatedResult ? "done" : relatedReceipt ? "receipt" : "pending",
        relatedReceipt,
        relatedResult,
      } satisfies SentHistoryItem;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export default async function DashboardSystemPage() {
  const eventPath = path.join(process.cwd(), "..", "共享协作区", "日志", "事件流.md");
  const rawEvents = safeRead(eventPath);
  const allEvents = parseEventStream(rawEvents);
  const events = allEvents.slice(-10).reverse();
  const outboxMessages = await readQueue("outbox").catch(() => []);
  const inboxMessages = await readQueue("inbox").catch(() => []);
  const visibleInboxMessages = keepLatestResultPerCommand(inboxMessages);
  const eventChain = await readEventChain().catch(() => []);
  const discussionThreads = await readDiscussionThreads().catch(() => []);
  const agentStatuses = await readAgentStatuses().catch(() => []);
  const wakeItems = await readWakeQueue().catch(() => []);
  const consumedWakeItems = await readWakeQueue({ includeConsumed: true, limit: 20 }).then((items) => items.filter((item) => item.consumedAt)).catch(() => []);
  const watchdogAlerts = await computeWatchdogAlerts().catch(() => []);
  const handedOffPromises = await readPromises().then((items) => items.filter((item) => item.status === "handed_off")).catch(() => []);
  const watchdogOutboxMessages = outboxMessages.filter((item) => item.kind.startsWith("watchdog_"));
  const discussionReplyCount = inboxMessages.filter((item) => {
    const meta = (item.meta || null) as Record<string, unknown> | null;
    return Boolean(extractTopicId(meta)) && isFinalDiscussionReply({ kind: item.kind, text: item.text, meta });
  }).length;
  const sentHistory = buildSentHistory(eventChain, visibleInboxMessages);
  const visibleInboxCards = [...visibleInboxMessages].reverse();
  const recipientSummary = summarizeRecipients(sentHistory.map((item) => ({ to: item.to } as (typeof outboxMessages)[number])) as Awaited<ReturnType<typeof readQueue>>);
  const staleAgentCount = agentStatuses.filter((item) => isStale(item.updatedAt)).length;

  const agents = await Promise.all(
    profileSpecs.map(async (spec) => {
      const port = getGatewayPort(spec.configPath, spec.fallbackPort);
      const online = await probePort(port);
      return { ...spec, port, online };
    }),
  );

  const onlineCount = agents.filter((agent) => agent.online).length;
  const offlineCount = agents.length - onlineCount;

  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(3,7,18,0.98))] p-4 shadow-2xl">
      <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
        <DashboardPageHeader
          eyebrow="Owner Backend · System"
          title="系统页"
          description="这一页先服务新的主目标，不是先派命令，而是先让阿三和零号围绕同一问题共享讨论、看到彼此、并能及时收口。"
          right={<a href="/dashboard" className="rounded-2xl border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-950">返回后台</a>}
        />

        <form action={createDiscussionAction} className="mt-4 grid gap-3 rounded-[24px] border border-white/10 bg-white/5 p-4 md:grid-cols-[220px_1fr_auto]">
          <div className="grid gap-2">
            <input name="title" placeholder="讨论主题，例如：Zero 与阿三如何分工" className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-400" required />
            <p className="text-[11px] text-slate-400">先发起共享讨论，不直接默认成命令。</p>
          </div>
          <div className="grid gap-2">
            <input name="prompt" placeholder="输入要让阿三与零号围绕同题讨论的问题" className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-400" required />
            <p className="text-[11px] text-slate-400">默认同时推给阿三和零号，topic 状态从 open 开始。</p>
          </div>
          <button type="submit" className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">发起共享讨论</button>
        </form>

        <form action={sendCommandAction} className="mt-3 grid gap-3 rounded-[24px] border border-white/10 bg-white/5 p-4 md:grid-cols-[220px_1fr_auto]">
          <div className="grid gap-2">
            <select name="to" defaultValue="阿三" className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none" required>
              {COMMAND_RECIPIENT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">当前前台只保留可直接发命令的目标。消息类型已固定为 command。</p>
          </div>
          <div className="grid gap-2">
            <input name="text" placeholder="直接给 Agent 的命令内容" className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-400" required />
            <p className="text-[11px] text-slate-400">`text` 和 `voice` 暂不单独开放，避免误导。</p>
          </div>
          <>
            <input type="hidden" name="kind" value="command" />
            <button type="submit" className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">网站直接发命令</button>
          </>
        </form>

        <div className="mt-4 grid gap-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-slate-400">在线代理</p>
                <p className="mt-0.5 text-base font-semibold text-white">{onlineCount} / {agents.length}</p>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">本地</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-slate-400">事件记录</p>
                <p className="mt-0.5 text-base font-semibold text-white">{events.length} / {allEvents.length}</p>
              </div>
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">可见</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-slate-400">讨论主题</p>
                <p className="mt-0.5 text-base font-semibold text-white">{discussionThreads.length}</p>
              </div>
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-300">网站</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-slate-400">Agent 心跳</p>
                <p className="mt-0.5 text-base font-semibold text-white">{agentStatuses.length}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${staleAgentCount > 0 ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>超时 {staleAgentCount}</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-slate-400">Wake 队列</p>
                <p className="mt-0.5 text-base font-semibold text-white">{wakeItems.length}</p>
              </div>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">待消费</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-slate-400">Watchdog 告警</p>
                <p className="mt-0.5 text-base font-semibold text-white">{watchdogAlerts.length}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${watchdogAlerts.some((item) => item.level === "error") ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>{watchdogAlerts.some((item) => item.level === "error") ? "error" : "warn"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <DashboardCard>
          <DashboardCardTitle
            title="共享讨论中心"
            desc="先把双 AI 围绕同一问题的讨论层跑稳，确保双方都能看见彼此，并且有明确收口。"
            right={<div className="flex items-center gap-2"><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">主题 {discussionThreads.length} 个 · 回帖 {discussionReplyCount} 条</span></div>}
          />

          <div className="mt-4 grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">讨论主题列表</p>
              <p className="mt-1 text-[11px] text-slate-500">先看 topic，再看具体来回发言。closed 后默认不再继续往返。</p>
              <div className="mt-3 space-y-2">
                {discussionThreads.length > 0 ? discussionThreads.map((thread) => {
                  const effectiveStatus = deriveDiscussionStatus(thread, inboxMessages);
                  const closureSource = discussionClosureSource(thread);
                  return (
                  <details key={thread.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-slate-500">{formatEasternTime(thread.updatedAt)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${discussionStatusBadge(effectiveStatus)}`}>{summarizeDiscussionStatus(effectiveStatus)}</span>
                        {closureSource ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${closureSource.tone}`}>{closureSource.label}</span> : null}
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{thread.participants.join(" / ")}</span>
                      </div>
                      <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-800">{thread.title}</p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">{emphasizeQuestion(thread.prompt)}</p>
                    </summary>
                    <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                      <p className="text-xs leading-5 text-slate-700">{thread.prompt}</p>
                      {thread.summary ? <div className="rounded-xl bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">{thread.summary}</div> : null}
                      <div className="flex flex-wrap gap-2">
                        {(["open", "deciding", "closed"] as DiscussionStatus[]).map((status) => (
                          <form key={status} action={updateDiscussionStatusAction}>
                            <input type="hidden" name="threadId" value={thread.id} />
                            <input type="hidden" name="title" value={thread.title} />
                            <input type="hidden" name="prompt" value={thread.prompt} />
                            <input type="hidden" name="participants" value={thread.participants.join(",")} />
                            <input type="hidden" name="status" value={status} />
                            <button type="submit" className={`rounded-full px-3 py-1 text-[11px] font-semibold ${status === effectiveStatus ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{summarizeDiscussionStatus(status)}</button>
                          </form>
                        ))}
                      </div>
                    </div>
                  </details>
                ); }) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">还没有讨论主题，先发起一个共享讨论</div>}
              </div>
            </div>

            <div className="space-y-3">
              {discussionThreads.length > 0 ? discussionThreads.map((thread) => {
                const timeline = buildDiscussionTimeline(thread, outboxMessages, inboxMessages);
                const participantStates = buildDiscussionParticipantStates(thread, outboxMessages, inboxMessages);
                const effectiveStatus = deriveDiscussionStatus(thread, inboxMessages);
                const typingParticipants = buildTypingParticipants(thread, inboxMessages);
                const closureSource = discussionClosureSource(thread);
                return (
                  <div key={thread.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{thread.title}</p>
                        <p className="mt-1 text-[11px] text-slate-500">topicId: {thread.id} · {thread.participants.join(" / ")}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${discussionStatusBadge(effectiveStatus)}`}>{summarizeDiscussionStatus(effectiveStatus)}</span>
                        {closureSource ? <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${closureSource.tone}`}>{closureSource.label}</span> : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {participantStates.map((item) => {
                        const chip = identityChip(item.participant);
                        return (
                          <span key={item.participant} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.state === "replied" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${chip.avatarTone}`}>{chip.avatar}</span>
                            {item.participant}
                            <span>{item.state === "replied" ? "已回复" : "待回复"}</span>
                          </span>
                        );
                      })}
                    </div>
                    {typingParticipants.length > 0 ? (
                      <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                        {typingParticipants.join("、")} 正在输入…
                      </div>
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {timeline.length > 0 ? timeline.map((message) => {
                        const fromChip = identityChip(message.from);
                        const toChip = identityChip(message.to);
                        return (
                          <div key={message.id} className={`rounded-2xl border px-3 py-2 ${message.stage === "processing" ? "border-amber-200 bg-amber-50/60" : message.lane === "outbox" ? "border-sky-200 bg-sky-50/60" : "border-emerald-200 bg-white"}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-slate-500">{formatEasternTime(message.createdAt)}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${message.lane === "outbox" ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"}`}>{message.lane === "outbox" ? "发出" : "回帖"}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${message.stage === "processing" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{message.stage === "processing" ? "处理中" : "最终结果"}</span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${fromChip.tone}`}>
                                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${fromChip.avatarTone}`}>{fromChip.avatar}</span>
                                {message.from}
                              </span>
                              <span className="text-[10px] text-slate-400">→</span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toChip.tone}`}>
                                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${toChip.avatarTone}`}>{toChip.avatar}</span>
                                {message.to}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-700">{message.text}</p>
                          </div>
                        );
                      }) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">这个 topic 还没有正式回复。</div>}
                    </div>
                  </div>
                );
              }) : null}
            </div>
          </div>
        </DashboardCard>

        <DashboardCard>
          <DashboardCardTitle
            title="命令中心 / 回执中心"
            desc="命令能力先保留，但降为第二优先，等讨论层跑稳后再继续升级。"
            right={<div className="flex items-center gap-2"><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">历史发件 {sentHistory.length} 条 · 已收到 {visibleInboxMessages.filter((item) => String(item.kind || "").toLowerCase() === "receipt").length} 条 · 已完成 {visibleInboxMessages.filter((item) => String(item.kind || "").toLowerCase() === "result").length} 条</span></div>}
          />

          <div className="mt-4 grid gap-3 xl:grid-cols-[0.62fr_1.38fr]">
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">按接收人统计</p>
                <div className="mt-3 space-y-2">
                  {recipientSummary.length > 0 ? recipientSummary.map((item) => (
                    <div key={item.recipient} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-sm text-slate-700">
                      <span>{item.recipient}</span>
                      <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">{item.count}</span>
                    </div>
                  )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">当前没有历史发件记录</div>}
                </div>
              </div>
            </div>

            <div className="grid gap-3 2xl:grid-cols-[1.06fr_0.94fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between gap-3 rounded-t-2xl border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur">
                  <p className="text-sm font-semibold text-slate-900">历史发件箱，网站发给 Agent 的命令</p>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">{sentHistory.length} 条</span>
                    <form action={clearCommandCenterHistoryAction}>
                      <ConfirmSubmitButton
                        message="确认清空命令中心全部历史记录吗？此操作将同时清空历史发件记录、回执记录与相关统计信息，且无法撤销。"
                        className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        清空历史
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
                <div className="space-y-2 overflow-y-auto pr-1 2xl:max-h-[72vh]">
                  {sentHistory.length > 0 ? (
                    <>
                      {sentHistory.map((message) => (
                        <details key={message.id} className={`rounded-2xl border bg-white p-3 ${message.status === "done" ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}>
                          <summary className="cursor-pointer list-none">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-slate-500">{formatEasternTime(message.createdAt)}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${bridgeKindBadge(message.kind)}`}>{displayBridgeKind(message.kind)}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${message.status === "done" ? "bg-emerald-100 text-emerald-800" : message.status === "receipt" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}>{message.status === "done" ? "已完成" : message.status === "receipt" ? "已收到" : "等待响应"}</span>
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">YANG → {message.to}</span>
                            </div>
                            <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-800">{summarizeMessageTitle(message.text)}</p>
                            <p className="mt-1 text-[11px] leading-4 text-slate-500">{emphasizeQuestion(message.text)}</p>
                          </summary>
                          <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                            <p className="text-xs leading-5 text-slate-700">{message.text}</p>
                            <div className="rounded-xl bg-slate-50 px-2.5 py-2 text-[11px] leading-5 text-slate-600">
                              <div>目标: {message.to}</div>
                              <div>命令ID: {message.commandId || "旧记录未存"}</div>
                              <div>响应状态: {message.status === "done" ? "已收到最终结果" : message.status === "receipt" ? "仅收到系统回执" : "尚未看到响应"}</div>
                              <div>显示方式: 标题摘要 + 展开详情</div>
                            </div>
                            {message.relatedReceipt ? (
                              <div className="rounded-xl bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-slate-700">
                                <div className="font-semibold text-amber-700">系统回执</div>
                                <div className="mt-1">{summarizeMessageTitle(message.relatedReceipt.text)}</div>
                              </div>
                            ) : null}
                            {message.relatedResult ? (
                              <div className="rounded-xl bg-emerald-50 px-2.5 py-2 text-[11px] leading-5 text-slate-700">
                                <div className="font-semibold text-emerald-700">真实结果</div>
                                <div className="mt-1">{summarizeMessageTitle(message.relatedResult.text)}</div>
                              </div>
                            ) : null}
                          </div>
                        </details>
                      ))}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">当前还没有历史发件记录</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-emerald-50/60 p-4">
                <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between gap-3 rounded-t-2xl border-b border-emerald-200 bg-emerald-50/95 px-4 py-4 backdrop-blur">
                  <p className="text-sm font-semibold text-slate-900">回执箱，Agent 回给老板的执行结果</p>
                  <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">{visibleInboxMessages.length} 条</span>
                </div>
                <div className="space-y-2 overflow-y-auto pr-1 2xl:max-h-[72vh]">
                  {visibleInboxCards.length > 0 ? (
                    <>
                      {visibleInboxCards.map((message, index) => (
                        <details key={`${message.id}-${index}`} className={`rounded-2xl border bg-white p-3 ${bridgeCardTone(message.kind, "border-emerald-200")}`}>
                          <summary className="cursor-pointer list-none">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-slate-500">{formatEasternTime(message.createdAt)}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${bridgeKindBadge(message.kind)}`}>{displayBridgeKind(message.kind)}</span>
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{message.from} → {message.to}</span>
                            </div>
                            <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-800">{summarizeMessageTitle(message.text)}</p>
                            <p className="mt-1 text-[11px] leading-4 text-slate-500">{emphasizeQuestion(message.text)}</p>
                          </summary>
                          <div className="mt-2 space-y-2 border-t border-emerald-100 pt-2">
                            <p className="text-xs leading-5 text-slate-700">{message.text}</p>
                            {message.meta ? (
                              <details className="rounded-xl bg-emerald-50/70 px-2.5 py-2">
                                <summary className="cursor-pointer text-[11px] font-medium text-slate-500">{compactMetaSummary(message.meta as Record<string, unknown>) || "查看元数据"}</summary>
                                <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950/95 p-2.5 text-[10px] leading-4 text-slate-100">{JSON.stringify(message.meta, null, 2)}</pre>
                              </details>
                            ) : null}
                          </div>
                        </details>
                      ))}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-emerald-200 bg-white px-4 py-6 text-sm text-slate-500">当前还没有回写到 inbox 的执行结果</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard>
          <DashboardCardTitle title="系统状态" desc="放在后面，只在需要诊断时看，不打断发命令和看回执。" right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{onlineCount} 在线 · {offlineCount} 离线</span>} />
          <div className="mt-3 grid gap-3 xl:grid-cols-[0.86fr_1.14fr]">
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">本地执行线</p>
                <p className="mt-1 text-[11px] text-slate-500">这里只看当前还在用的本地入口。</p>
                <div className="mt-2 space-y-2">
                  {agents.map((agent) => (
                    <div key={agent.key} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{agent.name}</p>
                        <p className="text-[11px] text-slate-500">{agent.profile} · {agent.port}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${agent.online ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                        {agent.online ? "在线" : "离线"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-white px-3 py-2"><span className="font-semibold text-sky-700">Bridge</span> 发件 {sentHistory.length}，待消费 {outboxMessages.length}，回执 {visibleInboxMessages.length}</div>
                  <div className="rounded-xl bg-white px-3 py-2"><span className="font-semibold text-rose-700">守望</span> 心跳 {agentStatuses.length}，超时 {staleAgentCount}</div>
                  <div className="rounded-xl bg-white px-3 py-2"><span className="font-semibold text-amber-700">Wake</span> 待消费 {wakeItems.length}，已消费 {consumedWakeItems.length}</div>
                  <div className="rounded-xl bg-white px-3 py-2"><span className="font-semibold text-violet-700">Watchdog</span> 告警 {watchdogAlerts.length}，交接 {handedOffPromises.length}，提醒 {watchdogOutboxMessages.length}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">Agent 心跳 / 状态</p>
                <p className="mt-1 text-[11px] text-slate-500">零号等远端状态优先在这里看。</p>
                <div className="mt-2 space-y-2">
                  {agentStatuses.length > 0 ? agentStatuses.map((item) => (
                    <div key={item.agent} className="rounded-xl bg-white px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadge(item.status)}`}>{item.status}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isStale(item.updatedAt) ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{displayRelativeAge(item.updatedAt)}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{item.agent}{item.role ? ` · ${item.role}` : ""}</p>
                      {item.summary ? <p className="mt-1 text-xs leading-5 text-slate-600">{item.summary}</p> : null}
                      <p className="mt-1 text-[11px] text-slate-500">owner: {item.owner || "-"} · backup: {item.backup || "-"} · task: {item.taskId || "-"}</p>
                    </div>
                  )) : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">还没有 agent 上报心跳</div>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">最近系统事件</p>
                <div className="mt-2 space-y-2">
                  {events.length > 0 ? events.slice(0, 5).map((event, index) => (
                    <div key={`${event.stamp}-${index}`} className="rounded-xl bg-white px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-slate-500">{event.stamp}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${taskEventTone(event.type)}`}>{displayTaskEventType(event.type)}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{event.actor}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{event.result}</p>
                    </div>
                  )) : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">暂无事件记录</div>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">Wake 队列</p>
                <p className="mt-1 text-[11px] text-slate-500">展示待消费与最近已消费的 wake 项，方便确认 outbox / handoff / watchdog 是否真的推送并被 agent 拿走了。</p>
                <div className="mt-2 space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500">待消费</p>
                    <div className="mt-2 space-y-2">
                      {wakeItems.length > 0 ? wakeItems.slice(0, 8).map((item) => (
                        <div key={item.id} className="rounded-xl bg-white px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-slate-500">{formatEasternTime(item.createdAt)}</span>
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{item.kind}</span>
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{item.targetAgent}</span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-600">related: {item.relatedId || "-"}{item.note ? ` · ${item.note}` : ""}</p>
                        </div>
                      )) : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">当前没有待消费的 wake 项</div>}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-slate-500">最近已消费</p>
                    <div className="mt-2 space-y-2">
                      {consumedWakeItems.length > 0 ? consumedWakeItems.slice(0, 8).map((item) => (
                        <div key={item.id} className="rounded-xl bg-white px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-slate-500">{formatEasternTime(item.consumedAt || item.createdAt)}</span>
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">{item.consumeResult || "consumed"}</span>
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{item.targetAgent}</span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-600">kind: {item.kind} · related: {item.relatedId || "-"}{item.note ? ` · ${item.note}` : ""}</p>
                        </div>
                      )) : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">当前还没有已消费的 wake 记录</div>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">Watchdog 告警</p>
                <p className="mt-1 text-[11px] text-slate-500">直接展示 watchdog 当前判定的告警，方便核对 stale / overdue / blocked / wake 这几类自动守望结果。</p>
                <div className="mt-2 space-y-2">
                  {watchdogAlerts.length > 0 ? watchdogAlerts.slice(0, 8).map((alert, index) => (
                    <div key={`${alert.kind}-${alert.relatedId || alert.target || index}`} className="rounded-xl bg-white px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${alert.level === "error" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{alert.level}</span>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{alert.kind}</span>
                        {alert.target ? <span className="text-[11px] text-slate-500">target: {alert.target}</span> : null}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{alert.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{alert.detail}</p>
                    </div>
                  )) : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">当前没有 watchdog 告警</div>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">Watchdog 交接结果</p>
                <p className="mt-1 text-[11px] text-slate-500">这里直接看被 watchdog 改成 handed_off 的 promise，确认自动交接不是只发了告警，而是真的改了 owner。</p>
                <div className="mt-2 space-y-2">
                  {handedOffPromises.length > 0 ? handedOffPromises.slice(0, 8).map((item) => (
                    <div key={item.id} className="rounded-xl bg-white px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-slate-500">{formatEasternTime(item.latestProgressAt || item.createdAt)}</span>
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">handed_off</span>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{item.owner}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">backup: {item.backup || "-"} · reason: {item.blockedReason || "-"}</p>
                    </div>
                  )) : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">当前没有 handed_off 的 promise</div>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">Watchdog 提醒发件</p>
                <p className="mt-1 text-[11px] text-slate-500">单独展示 watchdog 自动塞进 outbox 的提醒，避免它们混在普通人工发件里看不出来。</p>
                <div className="mt-2 space-y-2">
                  {watchdogOutboxMessages.length > 0 ? watchdogOutboxMessages.slice(-8).reverse().map((item) => (
                    <div key={item.id} className="rounded-xl bg-white px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-slate-500">{formatEasternTime(item.createdAt)}</span>
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">{item.kind}</span>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">watchdog → {item.to}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-700">{item.text}</p>
                      <p className="mt-1 text-[11px] text-slate-500">related: {String(item.meta?.relatedId || "-")}</p>
                    </div>
                  )) : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">当前没有 watchdog 自动提醒发件</div>}
                </div>
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
