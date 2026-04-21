import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DashboardCard, DashboardCardTitle, DashboardPageHeader } from "../components";
import { TASK_QUEUE_PATH, parseTaskQueue } from "@/lib/task-board";
import { TODO_PATH, parseTodoBoard, readTodoBoard } from "@/lib/todo-board";

function safeRead(filePath: string) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "文件不存在";
}

function clipLines(raw: string, lines = 18) {
  const list = raw.split(/\r?\n/).slice(0, lines);
  return raw.split(/\r?\n/).length > lines ? [...list, "", "...（已截断）"] : list;
}

function isMissing(raw: string) {
  return raw === "文件不存在";
}

function countLines(raw: string) {
  if (isMissing(raw)) return 0;
  return raw.split(/\r?\n/).length;
}

function lineTone(line: string) {
  const text = line.trim();
  if (!text) return "text-slate-400";
  if (text.startsWith("### ") || text.startsWith("## ")) return "font-semibold text-slate-900";
  if (text.includes("目标：") || text.includes("goal:")) return "font-semibold text-blue-700";
  if (text.includes("状态：") || text.includes("status:")) return "font-semibold text-emerald-700";
  if (text.includes("任务编号：") || text.includes("id:")) return "font-semibold text-slate-800";
  if (text.includes("负责人：") || text.includes("owner:")) return "font-semibold text-fuchsia-700";
  if (text.includes("下一步：") || text.includes("next_action:")) return "font-semibold text-sky-700";
  if (text.includes("备注：") || text.includes("notes:")) return "font-semibold text-indigo-700";
  if (text.includes("优先级：") || text.includes("priority:")) return "font-semibold text-amber-700";
  if (text.includes("阻塞原因：") || text.includes("blocked_by:")) return "font-semibold text-rose-700";
  if (text.includes("来源：") || text.includes("source:")) return "font-semibold text-violet-700";
  if (text.includes("创建时间：") || text.includes("created_at:")) return "font-semibold text-cyan-700";
  if (text.includes("最近更新：") || text.includes("updated_at:")) return "font-semibold text-teal-700";
  return "text-slate-600";
}

const docs = [
  ["TODO", TODO_PATH],
  ["错峰会议", path.join(process.cwd(), "..", "共享协作区", "交接", "错峰会议.md")],
  ["待接手任务", path.join(process.cwd(), "..", "共享协作区", "任务", "待接手任务.md")],
  ["共享长期记忆", path.join(process.cwd(), "..", "共享协作区", "记忆", "共享长期记忆.md")],
] as const;

export default async function DashboardMemoryPage() {
  const panels = docs.map(([label, file]) => ({ label, file, content: safeRead(file) }));
  const previewLines = 18;
  const todoItems = parseTodoBoard(readTodoBoard());
  const activeTodos = todoItems.filter((todo) => todo.section === "active");
  const completedTodos = todoItems.filter((todo) => todo.section === "completed");
  const tasks = parseTaskQueue(safeRead(TASK_QUEUE_PATH));

  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(3,7,18,0.98))] p-4 shadow-2xl">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <DashboardPageHeader
              eyebrow="Owner Backend · Memory"
              title="记忆工作台"
              description="这一页只放老板最常看的共享资料，不把系统状态和正式任务掺进来。重点是 TODO、会议、待接手任务和共享长期记忆。"
              right={<a href="/dashboard" className="rounded-2xl border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-950">返回后台</a>}
            />

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {panels.map((panel) => (
                <div key={panel.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{panel.label}</p>
                    {isMissing(panel.content) ? <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800">缺失</span> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{panel.file.replace(`${process.cwd()}\\..\\`, "")}</p>
                  <p className="mt-2 text-xs text-slate-400">共 {countLines(panel.content)} 行</p>
                  {panel.label === "TODO" ? <p className="mt-1 text-xs text-slate-400">进行中 {activeTodos.length} · 已完成 {completedTodos.length}</p> : null}
                </div>
              ))}
            </div>
          </div>

          <DashboardCard className="mt-4">
            <DashboardCardTitle
              title="TODO 焦点"
              desc="这一层是老板视角的开放待办，不等于已经进入正式执行队列。"
              right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">进行中 {activeTodos.length} · 已完成 {completedTodos.length}</span>}
            />
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {activeTodos.slice(0, 6).map((todo) => {
                const linkedTasks = tasks.filter((task) => `${task.source} ${task.notes} ${task.title}`.includes(todo.id));
                return (
                  <div key={todo.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{todo.id} · {todo.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{todo.status}</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">正式任务 {linkedTasks.length}</span>
                    </div>
                    {todo.goal !== "-" ? <p className="mt-3 text-sm leading-6 text-slate-600">目标：{todo.goal}</p> : null}
                    {todo.nextStep !== "-" ? <p className="mt-1 text-sm leading-6 text-slate-600">下一步：{todo.nextStep}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href="/dashboard/tasks" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100">去任务台</a>
                      {linkedTasks.slice(0, 2).map((task) => (
                        <span key={task.id} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{task.id}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {activeTodos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">当前没有进行中的 TODO 条目</div>
              ) : null}
            </div>
          </DashboardCard>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {panels.map((panel) => (
              <DashboardCard key={panel.label}>
                <DashboardCardTitle
                  title={panel.label}
                  desc={panel.file}
                  right={
                    <div className="flex items-center gap-2">
                      {isMissing(panel.content) ? <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800">缺失</span> : null}
                      {countLines(panel.content) > previewLines ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">已截断</span> : null}
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{Math.min(previewLines, countLines(panel.content))} / {countLines(panel.content)} 行</span>
                    </div>
                  }
                />

                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6">
                  {clipLines(panel.content, previewLines).map((line, index) => (
                    <div key={`${panel.label}-${index}`} className={`whitespace-pre-wrap ${lineTone(line)}`}>
                      {line || " "}
                    </div>
                  ))}
                </div>
              </DashboardCard>
            ))}
          </div>

          <DashboardCard className="mt-4">
            <DashboardCardTitle title="记忆页用途" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["看 TODO", "回答还有什么没做"],
                ["看会议", "回答最近说到哪了"],
                ["看长期记忆", "回答哪些规则已经沉淀"],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
                </div>
              ))}
            </div>
          </DashboardCard>
    </div>
  );
}
