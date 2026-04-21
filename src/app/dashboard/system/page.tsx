import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import net from "node:net";
import { DashboardCard, DashboardCardTitle, DashboardPageHeader } from "../components";

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

export default async function DashboardSystemPage() {
  const eventPath = path.join(process.cwd(), "..", "共享协作区", "日志", "事件流.md");
  const rawEvents = safeRead(eventPath);
  const allEvents = parseEventStream(rawEvents);
  const events = allEvents.slice(-10).reverse();

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
              description="这一页只看系统信号，不把任务、记忆、原型展示全挤进来。重点是在线状态、来源解释和最近事件。"
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
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">后台来源</p>
                <p className="mt-2 text-2xl font-semibold text-white">cron / heartbeat</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">当前目标</p>
                <p className="mt-2 text-lg font-semibold text-white">继续收口 system 真页面细节</p>
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
                  <p className="font-semibold text-emerald-700">会话来源</p>
                  <p className="mt-2 leading-6">来自最近聊天 / 最近 session 活动，适合判断谁在被人直接使用。</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-amber-700">正式任务板</p>
                  <p className="mt-2 leading-6">来自共享任务队列，强调正式接单与执行管理，不等于所有聊天都已进入执行。</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-sky-700">后台来源</p>
                  <p className="mt-2 leading-6">来自 cron / heartbeat / agent 后台会话，用来区分自动线和主聊天线。</p>
                </div>
              </div>
            </DashboardCard>

            <DashboardCard>
              <DashboardCardTitle
                title="最近事件"
                desc="从共享事件流读取最近系统相关动作"
                right={<div className="flex items-center gap-2"><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{events.length} / {allEvents.length} 条</span><a href="/dashboard?section=system" className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">旧版 system 面板</a></div>}
              />

              <div className="mt-4 space-y-3">
                {events.length > 0 ? events.map((event, index) => (
                  <div key={`${event.stamp}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">{event.stamp}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone(event.type)}`}>{displayEventType(event.type)}</span>
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">{event.task}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{event.actor}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{event.result}</p>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">暂无事件记录</div>
                )}
              </div>
            </DashboardCard>
          </div>
    </div>
  );
}
