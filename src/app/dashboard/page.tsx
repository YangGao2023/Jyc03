import path from "node:path";
import { homedir } from "node:os";
import net from "node:net";
import { safeRead } from "@/lib/fs-utils";
import { countTodoItems, readTodoBoard } from "@/lib/todo-board";
import { countBlockedTaskItems, countEventItems, countTaskItems, readEventStream, readTaskQueue } from "@/lib/task-board";
import { readWakeQueue } from "@/lib/wake-store";
import { computeWatchdogAlerts } from "@/lib/watchdog";

type AgentSpec = {
  key: string;
  name: string;
  role: string;
  profile: string;
  configPath: string;
  fallbackPort: number;
};

const agents: AgentSpec[] = [
  {
    key: "asan",
    name: "阿三",
    role: "协调 / 翻译 / 主操作位",
    profile: "A3",
    configPath: path.join(homedir(), ".openclaw-A3", "openclaw.json"),
    fallbackPort: 18789,
  },
  {
    key: "aben",
    name: "阿本",
    role: "本地执行 / 内容与业务落地",
    profile: "default",
    configPath: path.join(homedir(), ".openclaw", "openclaw.json"),
    fallbackPort: 19000,
  },
  {
    key: "xiaosi",
    name: "小四",
    role: "CAD / 出图 / 调研",
    profile: "Xiaosi",
    configPath: path.join(homedir(), ".openclaw-Xiaosi", "openclaw.json"),
    fallbackPort: 18790,
  },
];

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

const workspaceLinks = [
  ["总览页", "/dashboard/overview", "先看今天整体状态和重点"],
  ["业务页", "/dashboard/biz", "先做一句话下单、收据/PDF、导入导出"],
  ["任务页", "/dashboard/tasks", "只看正式任务与执行动作"],
  ["记忆页", "/dashboard/memory", "只看共享资料与长期记忆"],
  ["系统页", "/dashboard/system", "只看在线状态、来源和事件"],
] as const;

export default async function DashboardPage() {
  const todoRaw = readTodoBoard();
  const taskRaw = readTaskQueue();
  const eventRaw = readEventStream();

  const todoCount = countTodoItems(todoRaw);
  const taskCount = countTaskItems(taskRaw);
  const blockedCount = countBlockedTaskItems(taskRaw);
  const eventCount = countEventItems(eventRaw);
  const recentEventCount = Math.min(eventCount, 10);
  const wakeItems = await readWakeQueue().catch(() => []);
  const watchdogAlerts = await computeWatchdogAlerts().catch(() => []);
  const pendingWakeCount = wakeItems.filter((item) => !item.consumedAt).length;

  const liveAgents = await Promise.all(
    agents.map(async (agent) => {
      const port = getGatewayPort(agent.configPath, agent.fallbackPort);
      const online = await probePort(port);
      return { ...agent, port, online };
    }),
  );
  const onlineCount = liveAgents.filter((agent) => agent.online).length;
  const offlineCount = liveAgents.length - onlineCount;

  return (
    <div className="rounded-[30px] border border-blue-800/40 bg-[linear-gradient(180deg,_rgba(30,64,175,0.98),_rgba(23,37,84,0.98))] p-4 shadow-2xl">
          <div className="rounded-[24px] border border-blue-800/40 bg-blue-900/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-blue-200">Owner Backend</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">后台首页</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-200">这里不再承担所有细节，只做老板入口。真正的工作去 biz / overview / tasks / memory / system 五个页面里看。</p>
              </div>
              <form action="/api/logout" method="POST">
                <button className="rounded-2xl border border-blue-700 bg-blue-600 px-4 py-2 text-sm font-semibold text-white">退出登录</button>
              </form>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-2xl border border-blue-800/40 bg-blue-900/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-blue-300/70">TODO</p>
                <p className="mt-2 text-2xl font-semibold text-white">{todoCount}</p>
              </div>
              <div className="rounded-2xl border border-blue-800/40 bg-blue-900/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-blue-300/70">正式任务</p>
                <p className="mt-2 text-2xl font-semibold text-white">{taskCount}</p>
              </div>
              <div className="rounded-2xl border border-blue-800/40 bg-blue-900/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-blue-300/70">阻塞</p>
                <p className="mt-2 text-2xl font-semibold text-white">{blockedCount} / {taskCount}</p>
              </div>
              <div className="rounded-2xl border border-blue-800/40 bg-blue-900/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-blue-300/70">最近事件</p>
                <p className="mt-2 text-2xl font-semibold text-white">{recentEventCount} / {eventCount}</p>
              </div>
              <div className="rounded-2xl border border-blue-800/40 bg-blue-900/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-blue-300/70">待消费 Wake</p>
                <p className="mt-2 text-2xl font-semibold text-white">{pendingWakeCount}</p>
              </div>
              <div className="rounded-2xl border border-blue-800/40 bg-blue-900/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-blue-300/70">Watchdog 告警</p>
                <p className="mt-2 text-2xl font-semibold text-white">{watchdogAlerts.length}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-[24px] bg-blue-900/20 p-4 text-blue-100 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-blue-200">工作区入口</p>
                  <p className="mt-1 text-sm text-blue-300">从首页分流，不再把 {workspaceLinks.length} 个区堆在同一页里。业务、总览、任务、记忆、系统都在这里直接进。</p>
                </div>
                <span className="rounded-full bg-blue-950 px-3 py-1 text-xs font-semibold text-white">{workspaceLinks.length} 区</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {workspaceLinks.map(([title, href, desc]) => (
                  <a key={href} href={href} className="rounded-2xl border border-blue-800/40 bg-blue-900/30 p-4 transition hover:bg-blue-700">
                    <p className="text-sm font-semibold text-blue-100">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-blue-300">{desc}</p>
                    <p className="mt-3 text-xs font-semibold text-blue-200">{href}</p>
                  </a>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] bg-blue-900/20 p-4 text-blue-100 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-blue-200">代理在线状态</p>
                <span className="rounded-full bg-blue-950 px-3 py-1 text-xs font-semibold text-white">{onlineCount} 在线 · {offlineCount} 离线</span>
              </div>
              <div className="mt-4 grid gap-3">
                {liveAgents.map((agent) => (
                  <div key={agent.key} className="rounded-2xl border border-blue-800/40 bg-blue-900/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-blue-100">{agent.name}</p>
                        <p className="mt-1 text-xs text-blue-300">{agent.role}</p>
                        <p className="mt-1 text-xs text-blue-300">配置档案：{agent.profile} · 端口：{agent.port}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${agent.online ? "bg-emerald-100 text-emerald-800" : "bg-blue-800/40 text-blue-200"}`}>
                        {agent.online ? "在线" : "离线"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
    </div>
  );
}
