import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import net from "node:net";
import { revalidatePath } from "next/cache";
import { DashboardCard, DashboardCardTitle, DashboardPageHeader } from "../components";
import { enqueueMessage, readQueue } from "@/lib/agent-bridge";
import { readAgentStatuses } from "@/lib/agent-status";
import { appendEvent, readEventChain } from "@/lib/event-store";
import { formatEasternTime } from "@/lib/time";

const profileSpecs = [
  {
    key: "asan",
    name: "阿三",
    profile: "A3",
    configPath: path.join(homedir(), ".openclaw-A3", "openclaw.json"),
    fallbackPort: 18789,
  },
  {
    key: "aben",
    name: "阿本",
    profile: "default",
    configPath: path.join(homedir(), ".openclaw", "openclaw.json"),
    fallbackPort: 19000,
  },
  {
    key: "xiaosi",
    name: "小四",
    profile: "Xiaosi",
    configPath: path.join(homedir(), ".openclaw-Xiaosi", "openclaw.json"),
    fallbackPort: 18790,
  },
] as const;

type EventItem = {
  stamp: string;
  actor: string;
  type: string;
  task: string;
  result: string;
};

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
  status: "pending" | "done";
  relatedInbox?: Awaited<ReturnType<typeof readQueue>>[number];
};

const COMMAND_RECIPIENT_OPTIONS = [
  { value: "阿三", label: "阿三（可执行）" },
  { value: "阿本", label: "阿本（语音/TTS 线）" },
  { value: "小四", label: "小四（本地执行线）" },
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

function safeRead(filePath: string) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
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

function parseEventStream(raw: string): EventItem[] {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("- ["))
    .map((line) => {
      const match = line.match(/^\- \[(.+?)\]\s+actor=(.+?)\s+type=(.+?)\s+task=(.+?)\s+result=(.+)$/);
      return {
        stamp: match?.[1] || "未知时间",
        actor: match?.[2] || "未知",
        type: match?.[3] || "unknown",
        task: match?.[4] || "-",
        result: match?.[5] || line.trim(),
      };
    });
}

function tone(type: string) {
  if (type === "status_change") return "bg-sky-100 text-sky-800";
  if (type === "task_created") return "bg-cyan-100 text-cyan-800";
  if (type === "task_claimed") return "bg-fuchsia-100 text-fuchsia-800";
  if (type === "memory_promoted") return "bg-indigo-100 text-indigo-800";
  if (type === "blocked") return "bg-rose-100 text-rose-800";
  if (type === "handoff") return "bg-violet-100 text-violet-800";
  if (type === "decision") return "bg-amber-100 text-amber-800";
  if (type === "completed") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

function displayEventType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "status_change") return "状态变更";
  if (normalized === "task_created") return "任务创建";
  if (normalized === "task_claimed") return "任务认领";
  if (normalized === "handoff") return "交接";
  if (normalized === "decision") return "决策";
  if (normalized === "memory_promoted") return "记忆提升";
  if (normalized === "blocked") return "阻塞";
  if (normalized === "completed") return "完成";
  if (normalized === "unknown") return "未知事件";
  return value;
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
    const commandId = String(message.meta?.commandId || "").trim();
    if (String(message.kind || "").toLowerCase() !== "result" || !commandId) {
      continue;
    }
    latestResultByCommandId.set(commandId, message);
  }

  return messages.filter((message) => {
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

function buildSentHistory(items: Awaited<ReturnType<typeof readEventChain>>, inboxMessages: Awaited<ReturnType<typeof readQueue>>) {
  const latestInboxByCommandId = new Map<string, (typeof inboxMessages)[number]>();
  for (const message of inboxMessages) {
    const commandId = String(message.meta?.commandId || "").trim();
    if (commandId) latestInboxByCommandId.set(commandId, message);
  }

  return items
    .filter((item) => item.actor === "YANG" && item.type === "promise_created" && (item.target || "") !== "")
    .map((item) => {
      const relatedInbox = item.promiseId ? latestInboxByCommandId.get(item.promiseId) : undefined;
      return {
        id: item.id,
        commandId: item.promiseId,
        createdAt: item.timestamp,
        to: item.target || "未指定",
        kind: extractCommandKindFromSummary(item.summary || ""),
        text: extractCommandTextFromSummary(item.summary || ""),
        status: relatedInbox ? "done" : "pending",
        relatedInbox,
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
  const agentStatuses = await readAgentStatuses().catch(() => []);
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
          description="这一页开始真正回答老板最想知道的系统问题：谁在线，桥里现在堆了什么消息，谁在往谁那里派单。"
          right={<a href="/dashboard" className="rounded-2xl border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-950">返回后台</a>}
        />

        <form action={sendCommandAction} className="mt-4 grid gap-3 rounded-[24px] border border-white/10 bg-white/5 p-4 md:grid-cols-[220px_140px_1fr_auto]">
          <div className="grid gap-2">
            <select name="to" defaultValue="阿三" className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none" required>
              {COMMAND_RECIPIENT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">只显示当前有消费能力的收件人，零号暂不支持网站 outbox 直投。</p>
          </div>
          <select name="kind" className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none">
            <option value="command">command</option>
            <option value="text">text</option>
            <option value="voice">voice</option>
          </select>
          <input name="text" placeholder="直接给 Agent 的命令内容" className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-400" required />
          <button type="submit" className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">网站直接发命令</button>
        </form>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">在线代理</p>
            <p className="mt-2 text-2xl font-semibold text-white">{onlineCount} / {agents.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">事件记录</p>
            <p className="mt-2 text-2xl font-semibold text-white">{events.length} / {allEvents.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">历史发件箱</p>
            <p className="mt-2 text-2xl font-semibold text-white">{sentHistory.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Agent 心跳</p>
            <p className="mt-2 text-2xl font-semibold text-white">{agentStatuses.length}</p>
            <p className="mt-1 text-xs text-slate-400">{staleAgentCount} 个超时未更新</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <DashboardCard>
          <DashboardCardTitle title="状态信号" right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{onlineCount} 在线 · {offlineCount} 离线</span>} />
          <div className="mt-4 grid gap-3">
            {agents.map((agent) => (
              <div key={agent.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{agent.name}</p>
                    <p className="mt-1 text-xs text-slate-500">配置档案：{agent.profile} · 端口：{agent.port}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${agent.online ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                    {agent.online ? "在线" : "离线"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-white px-3 py-2"><span className="font-semibold text-sky-700">Bridge</span> 历史发件 {sentHistory.length}，待消费 {outboxMessages.length}，可见回执 {visibleInboxMessages.length}</div>
              <div className="rounded-xl bg-white px-3 py-2"><span className="font-semibold text-rose-700">守望</span> 心跳 {agentStatuses.length}，超时 {staleAgentCount}，在线 {onlineCount}</div>
              <div className="rounded-xl bg-white px-3 py-2"><span className="font-semibold text-emerald-700">人工线</span> 重点看老板手动发出的命令和回执</div>
              <div className="rounded-xl bg-white px-3 py-2"><span className="font-semibold text-amber-700">后台线</span> 重点看 cron / heartbeat / 后台会话变化</div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard>
          <DashboardCardTitle
            title="桥接派单 / 回执视图"
            desc="老板现在既能看到谁往桥里发了什么，也能看到 agent 回写了什么。"
            right={<div className="flex items-center gap-2"><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">历史发件 {sentHistory.length} 条 · 回执 {visibleInboxMessages.length} 条</span><a href="/dashboard?section=system" className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">旧版 system 面板</a></div>}
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
                  )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">当前没有待分发消息</div>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Agent 心跳 / 状态</p>
                <div className="mt-3 space-y-2">
                  {agentStatuses.length > 0 ? agentStatuses.map((item) => (
                    <div key={item.agent} className="rounded-2xl bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadge(item.status)}`}>{item.status}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isStale(item.updatedAt) ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{displayRelativeAge(item.updatedAt)}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{item.agent}{item.role ? ` · ${item.role}` : ""}</p>
                      {item.summary ? <p className="mt-1 text-sm leading-6 text-slate-600">{item.summary}</p> : null}
                      <p className="mt-1 text-xs text-slate-500">owner: {item.owner || "-"} · backup: {item.backup || "-"} · task: {item.taskId || "-"}</p>
                    </div>
                  )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">还没有 agent 上报心跳</div>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">最近系统事件</p>
                <div className="mt-3 space-y-2">
                  {events.length > 0 ? events.slice(0, 5).map((event, index) => (
                    <div key={`${event.stamp}-${index}`} className="rounded-2xl bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">{event.stamp}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone(event.type)}`}>{displayEventType(event.type)}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{event.actor}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{event.result}</p>
                    </div>
                  )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">暂无事件记录</div>}
                </div>
              </div>
            </div>

            <div className="grid gap-3 2xl:grid-cols-[1.06fr_0.94fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between gap-3 rounded-t-2xl border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur">
                  <p className="text-sm font-semibold text-slate-900">历史发件箱，网站发给 Agent 的命令</p>
                  <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">{sentHistory.length} 条</span>
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
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${message.status === "done" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{message.status === "done" ? "已回执" : "等待回执"}</span>
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
                              <div>回执状态: {message.status === "done" ? "已收到结果" : "尚未看到结果"}</div>
                              <div>显示方式: 标题摘要 + 展开详情</div>
                            </div>
                            {message.relatedInbox ? (
                              <div className="rounded-xl bg-emerald-50 px-2.5 py-2 text-[11px] leading-5 text-slate-700">
                                <div className="font-semibold text-emerald-700">最新结果</div>
                                <div className="mt-1">{summarizeMessageTitle(message.relatedInbox.text)}</div>
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
      </div>
    </div>
  );
}
