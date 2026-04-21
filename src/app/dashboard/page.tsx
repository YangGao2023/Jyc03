import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import net from "node:net";

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

function countMatches(raw: string, pattern: RegExp) {
  return raw.split(/\r?\n/).filter((line) => pattern.test(line.trim())).length;
}

const workspaceLinks = [
  ["总览页", "/dashboard/overview", "先看今天整体状态和重点"],
  ["任务页", "/dashboard/tasks", "只看正式任务与执行动作"],
  ["记忆页", "/dashboard/memory", "只看共享资料与长期记忆"],
  ["系统页", "/dashboard/system", "只看在线状态、来源和事件"],
] as const;

export default async function DashboardPage() {
  const todoRaw = safeRead(path.join(process.cwd(), "..", "共享协作区", "任务", "TODO.md"));
  const taskRaw = safeRead(path.join(process.cwd(), "..", "共享协作区", "任务", "任务队列.md"));
  const eventRaw = safeRead(path.join(process.cwd(), "..", "共享协作区", "日志", "事件流.md"));

  const todoCount = countMatches(todoRaw, /^### \[TODO-/);
  const taskCount = countMatches(taskRaw, /^### \[TASK-/);
  const blockedCount = taskRaw.split(/\r?\n/).filter((line) => line.includes("- status: blocked")).length;
  const eventCount = eventRaw.split(/\r?\n/).filter((line) => line.trim().startsWith("- [")).length;
  const recentEventCount = Math.min(eventCount, 10);

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
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(3,7,18,0.98))] p-4 shadow-2xl">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-sky-300">Owner Backend</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">后台首页</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">这里不再承担所有细节，只做老板入口。真正的工作去 overview / tasks / memory / system 四个页面里看。</p>
              </div>
              <form action="/api/logout" method="POST">
                <button className="rounded-2xl border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-950">退出登录</button>
              </form>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">TODO</p>
                <p className="mt-2 text-2xl font-semibold text-white">{todoCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">正式任务</p>
                <p className="mt-2 text-2xl font-semibold text-white">{taskCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">阻塞</p>
                <p className="mt-2 text-2xl font-semibold text-white">{blockedCount} / {taskCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">最近事件</p>
                <p className="mt-2 text-2xl font-semibold text-white">{recentEventCount} / {eventCount}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-[24px] bg-white p-4 text-slate-900 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-sky-700">工作区入口</p>
                  <p className="mt-1 text-sm text-slate-500">从首页分流，不再把四个区堆在同一页里</p>
                </div>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{workspaceLinks.length} 区</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {workspaceLinks.map(([title, href, desc]) => (
                  <a key={href} href={href} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100">
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
                    <p className="mt-3 text-xs font-semibold text-sky-700">{href}</p>
                  </a>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] bg-white p-4 text-slate-900 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-sky-700">代理在线状态</p>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{onlineCount} 在线 · {offlineCount} 离线</span>
              </div>
              <div className="mt-4 grid gap-3">
                {liveAgents.map((agent) => (
                  <div key={agent.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{agent.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{agent.role}</p>
                        <p className="mt-1 text-xs text-slate-500">配置档案：{agent.profile} · 端口：{agent.port}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${agent.online ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
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
