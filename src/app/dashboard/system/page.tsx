import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import net from "node:net";
import { DashboardCard, DashboardCardTitle, DashboardPageHeader } from "../components";
import { readQueue } from "@/lib/agent-bridge";

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
  return value || "未知";
}

export default async function DashboardSystemPage() {
  const eventPath = path.join(process.cwd(), "..", "共享协作区", "日志", "事件流.md");
  const rawEvents = safeRead(eventPath);
  const allEvents = parseEventStream(rawEvents);
  const events = allEvents.slice(-10).reverse();
  const outboxMessages = await readQueue("outbox").catch(() => []);
  const inboxMessages = await readQueue("inbox").catch(() => []);
  const recentBridgeMessages = outboxMessages.slice(-8).reverse();
  const recipientSummary = summarizeRecipients(outboxMessages);

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
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Bridge Outbox</p>
            <p className="mt-2 text-2xl font-semibold text-white">{outboxMessages.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Bridge Inbox</p>
            <p className="mt-2 text-2xl font-semibold text-white">{inboxMessages.length}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
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

          <div className="mt-4 grid gap-3 text-sm text-slate-600">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-sky-700">Bridge 概况</p>
              <p className="mt-2 leading-6">当前 outbox 共 {outboxMessages.length} 条待分发消息，inbox 共 {inboxMessages.length} 条回传消息。这里开始回答“谁在往桥里派单、积压压在谁那里”。</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-emerald-700">会话来源</p>
              <p className="mt-2 leading-6">来自最近聊天 / 最近 session 活动，适合判断谁在被人直接使用。</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-amber-700">后台来源</p>
              <p className="mt-2 leading-6">来自 cron / heartbeat / agent 后台会话，用来区分自动线和主聊天线。</p>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard>
          <DashboardCardTitle
            title="Bridge 派单视图"
            desc="老板终于能直接看到：谁往桥里发了什么，当前积压压在谁那里。"
            right={<div className="flex items-center gap-2"><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">outbox {outboxMessages.length} 条</span><a href="/dashboard?section=system" className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">旧版 system 面板</a></div>}
          />

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
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

            <div className="space-y-3">
              {recentBridgeMessages.length > 0 ? recentBridgeMessages.map((message, index) => (
                <div key={`${message.id}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">{message.createdAt}</span>
                    <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800">{displayBridgeKind(message.kind)}</span>
                    <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">{message.from} → {message.to}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{message.text}</p>
                  {message.meta ? <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950/95 p-3 text-[11px] leading-5 text-slate-100">{JSON.stringify(message.meta, null, 2)}</pre> : null}
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">当前没有待分发 bridge 消息</div>
              )}
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
