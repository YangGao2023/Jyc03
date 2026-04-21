import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DashboardCard, DashboardCardTitle, DashboardPageHeader } from "../components";

function safeRead(filePath: string) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function countMatches(raw: string, pattern: RegExp) {
  return raw.split(/\r?\n/).filter((line) => pattern.test(line.trim())).length;
}

function getSortValue(value: string) {
  const normalized = value.trim();
  const parsed = Date.parse(normalized.replace(" ", "T"));
  return Number.isNaN(parsed) ? normalized : parsed;
}

function parseRecentTasks(raw: string) {
  return raw
    .split(/\r?\n(?=### \[TASK-)/)
    .filter((block) => /^### \[TASK-\d+\]/.test(block.trim()))
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const heading = lines[0] || "";
      const match = heading.match(/^### \[(TASK-\d+)\]\s+(.+)$/);
      const title = match?.[2] || heading.replace(/^###\s+/, "") || "未命名任务";
      const getField = (name: string) => lines.find((line) => line.trim().startsWith(`- ${name}:`))?.split(":").slice(1).join(":").trim() || "-";
      return {
        id: match?.[1] || "TASK-???",
        title,
        owner: getField("owner"),
        priority: getField("priority"),
        status: getField("status"),
        source: getField("source"),
        blockedBy: getField("blocked_by"),
        nextAction: getField("next_action"),
        createdAt: getField("created_at"),
        updatedAt: getField("updated_at"),
      };
    })
    .sort((a, b) => {
      const left = getSortValue(a.updatedAt);
      const right = getSortValue(b.updatedAt);
      if (typeof left === "number" && typeof right === "number") return right - left;
      return String(right).localeCompare(String(left));
    })
    .slice(0, 6);
}

function parseRecentEvents(raw: string) {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("- ["))
    .slice(-5)
    .reverse();
}

function statusTone(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["in_progress", "进行中"].includes(normalized)) return "bg-sky-100 text-sky-800";
  if (["done", "已完成"].includes(normalized)) return "bg-emerald-100 text-emerald-800";
  if (["blocked", "阻塞"].includes(normalized)) return "bg-rose-100 text-rose-800";
  if (["new", "待开始"].includes(normalized)) return "bg-amber-100 text-amber-800";
  if (["claimed", "已认领"].includes(normalized)) return "bg-violet-100 text-violet-800";
  return "bg-slate-100 text-slate-700";
}

function displayStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "in_progress") return "进行中";
  if (normalized === "done") return "已完成";
  if (normalized === "blocked") return "阻塞";
  if (normalized === "new") return "待开始";
  if (normalized === "claimed") return "已认领";
  return value;
}

export default async function DashboardOverviewPage() {
  const todoPath = path.join(process.cwd(), "..", "共享协作区", "任务", "TODO.md");
  const taskPath = path.join(process.cwd(), "..", "共享协作区", "任务", "任务队列.md");
  const handoffPath = path.join(process.cwd(), "..", "共享协作区", "任务", "待接手任务.md");
  const eventPath = path.join(process.cwd(), "..", "共享协作区", "日志", "事件流.md");

  const todoRaw = safeRead(todoPath);
  const taskRaw = safeRead(taskPath);
  const handoffRaw = safeRead(handoffPath);
  const eventRaw = safeRead(eventPath);

  const todoCount = countMatches(todoRaw, /^### \[TODO-/);
  const taskCount = countMatches(taskRaw, /^### \[TASK-/);
  const blockedCount = taskRaw.split(/\r?\n/).filter((line) => line.includes("- status: blocked")).length;
  const handoffCount = countMatches(handoffRaw, /^### /);
  const recentTasks = parseRecentTasks(taskRaw);
  const recentEvents = parseRecentEvents(eventRaw);
  const totalEventCount = countMatches(eventRaw, /^- \[/);

  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(3,7,18,0.98))] p-4 shadow-2xl">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <DashboardPageHeader
              eyebrow="Owner Backend · Overview"
              title="总览页"
              description="这一页只回答老板最先想知道的几件事：现在有多少事在跑、哪里卡住了、谁该接手、最近系统到底做了什么。"
              right={<a href="/dashboard" className="rounded-2xl border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-950">返回后台</a>}
            />

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
                <p className="mt-2 text-2xl font-semibold text-white">{blockedCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">待接手</p>
                <p className="mt-2 text-2xl font-semibold text-white">{handoffCount}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <DashboardCard>
              <DashboardCardTitle
                title="当前任务焦点"
                desc="老板首页先看最近几条正式任务"
                right={<div className="flex items-center gap-2"><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{recentTasks.length} / {taskCount} 条</span><a href="/dashboard/tasks" className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">打开任务页</a></div>}
              />

              <div className="mt-4 grid gap-3">
                {recentTasks.length > 0 ? recentTasks.map((task, index) => (
                  <div key={`${task.title}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(task.status)}`}>{displayStatus(task.status)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">任务编号：{task.id}</p>
                    <p className="mt-1 text-xs text-slate-500">负责人：{task.owner}</p>
                    <p className="mt-1 text-xs text-slate-500">优先级：{task.priority}</p>
                    <p className="mt-1 text-xs text-slate-500">来源：{task.source}</p>
                    <p className="mt-1 text-xs text-slate-500">创建时间：{task.createdAt}</p>
                    <p className="mt-1 text-xs text-slate-500">最近更新：{task.updatedAt}</p>
                    {task.blockedBy && task.blockedBy !== "-" ? <p className="mt-2 text-sm leading-6 text-rose-700">阻塞原因：{task.blockedBy}</p> : null}
                    <p className="mt-2 text-sm leading-6 text-slate-600">下一步：{task.nextAction}</p>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">暂无任务记录</div>
                )}
              </div>
            </DashboardCard>

            <section className="space-y-4">
              <DashboardCard>
                <DashboardCardTitle
                  title="最近事件"
                  desc="先看最新动作，不用先钻系统页"
                  right={<div className="flex items-center gap-2"><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{recentEvents.length} / {totalEventCount} 条</span><a href="/dashboard/system" className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">打开系统页</a></div>}
                />

                <div className="mt-4 space-y-3">
                  {recentEvents.length > 0 ? recentEvents.map((line, index) => (
                    <div key={`${line}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                      {line}
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">暂无事件记录</div>
                  )}
                </div>
              </DashboardCard>

              <DashboardCard>
                <DashboardCardTitle title="老板入口建议" />
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    ["先看总览", "判断今天有没有需要你立刻介入的地方"],
                    ["再看任务", "把正式执行和闲聊区分开"],
                    ["最后看系统", "确认状态与证据是不是对得上"],
                  ].map(([title, desc]) => (
                    <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">{title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </section>
          </div>
    </div>
  );
}
