import { DashboardCard, DashboardCardTitle, DashboardPageHeader } from "../components";
import { EVENT_STREAM_PATH, TASK_QUEUE_PATH, getSortValue, parseEventStream, parseTaskQueue, safeRead } from "@/lib/task-board";
import { formatEasternTime } from "@/lib/time";
import { parseTodoBoard, readTodoBoard } from "@/lib/todo-board";

function statusTone(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["in_progress", "进行中"].includes(normalized)) return "bg-sky-100 text-sky-800";
  if (["done", "已完成"].includes(normalized)) return "bg-emerald-100 text-emerald-800";
  if (["blocked", "阻塞"].includes(normalized)) return "bg-rose-100 text-rose-800";
  if (["new", "待开始"].includes(normalized)) return "bg-amber-100 text-amber-800";
  if (["claimed", "已认领"].includes(normalized)) return "bg-violet-100 text-violet-800";
  if (["dropped", "已放弃"].includes(normalized)) return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function displayStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "in_progress") return "进行中";
  if (normalized === "done") return "已完成";
  if (normalized === "blocked") return "阻塞";
  if (normalized === "new") return "待开始";
  if (normalized === "claimed") return "已认领";
  if (normalized === "dropped") return "已放弃";
  return value;
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

export default async function DashboardTasksPage({
  searchParams,
}: {
  searchParams?: Promise<{ taskFilter?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const taskFilter = ["in_progress", "todo", "blocked", "all"].includes(resolvedSearchParams.taskFilter || "")
    ? resolvedSearchParams.taskFilter || "in_progress"
    : "in_progress";

  const tasks = parseTaskQueue(safeRead(TASK_QUEUE_PATH)).sort((a, b) => {
    const left = getSortValue(a.updatedAt);
    const right = getSortValue(b.updatedAt);
    if (typeof left === "number" && typeof right === "number") return right - left;
    return String(right).localeCompare(String(left));
  });
  const events = parseEventStream(safeRead(EVENT_STREAM_PATH));
  const todos = parseTodoBoard(readTodoBoard());
  const activeTodos = todos.filter((todo) => todo.section === "active");

  const filterCounts = {
    in_progress: tasks.filter((task) => task.status === "in_progress").length,
    todo: tasks.filter((task) => ["new", "claimed"].includes(task.status)).length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    all: tasks.filter((task) => task.status !== "done").length,
  };

  const visibleTasks = taskFilter === "all"
    ? tasks.filter((task) => task.status !== "done")
    : taskFilter === "blocked"
      ? tasks.filter((task) => task.status === "blocked")
      : taskFilter === "todo"
        ? tasks.filter((task) => ["new", "claimed"].includes(task.status))
        : tasks.filter((task) => task.status === "in_progress");

  const emptyStateLabel = taskFilter === "blocked"
    ? "当前没有阻塞任务"
    : taskFilter === "todo"
      ? "当前没有待处理任务"
      : taskFilter === "all"
        ? "当前没有未完成任务"
        : "当前没有进行中的任务";

  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(3,7,18,0.98))] p-4 shadow-2xl">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <DashboardPageHeader
              eyebrow="Owner Backend · Tasks"
              title="任务执行台"
              description="这一页只看正式任务，不把记忆和系统信号混在一起。重点是当前谁在做、卡在哪里、下一步是什么。"
              right={<a href="/dashboard" className="rounded-2xl border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-950">返回后台</a>}
            />

            <form action="/api/task-create" method="POST" className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <input type="hidden" name="returnTo" value={`/dashboard/tasks?taskFilter=${taskFilter}`} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">新增正式任务</p>
                  <p className="mt-1 text-xs text-slate-300">直接从任务台写入任务队列和事件流。</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-medium text-slate-200">
                  标题
                  <input name="title" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none" placeholder="比如：接真实产品照片到前台" />
                </label>
                <label className="text-xs font-medium text-slate-200">
                  负责人
                  <select name="owner" defaultValue="待定" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none">
                    {["待定", "阿三", "阿本", "小四", "西风", "零号"].map((owner) => (
                      <option key={owner} value={owner}>{owner}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-200">
                  优先级
                  <select name="priority" defaultValue="P2" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none">
                    {["P0", "P1", "P2", "P3"].map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-200">
                  来源
                  <input name="source" defaultValue="老板后台新增任务" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none" />
                </label>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1.3fr_0.7fr]">
                <label className="text-xs font-medium text-slate-200">
                  下一步
                  <input name="nextAction" defaultValue="待补充" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <label className="text-xs font-medium text-slate-200">
                  备注
                  <input name="notes" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none" placeholder="可留空" />
                </label>
              </div>
              <button className="mt-4 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
                新建任务
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["in_progress", "进行中"],
                ["todo", "待处理"],
                ["blocked", "阻塞"],
                ["all", "全部未完成"],
              ].map(([value, label]) => {
                const active = taskFilter === value;
                return (
                  <a
                    key={value}
                    href={`/dashboard/tasks?taskFilter=${value}`}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active ? "border-white bg-white text-slate-950" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    {label} · {filterCounts[value as keyof typeof filterCounts]}
                  </a>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <DashboardCard>
              <DashboardCardTitle
                title="当前任务"
                desc="按状态筛选后的正式任务列表"
                right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{visibleTasks.length} / {tasks.length} 条</span>}
              />

              <div className="mt-4 grid gap-3">
                {visibleTasks.length > 0 ? visibleTasks.map((task) => {
                  const relatedEvents = events.filter((event) => event.task === task.id).slice(-2).reverse();
                  return (
                    <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{task.id} · {task.title}</p>
                          <p className="mt-1 text-xs text-slate-500">负责人：{task.owner}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(task.priority)}`}>{task.priority}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(task.status)}`}>{displayStatus(task.status)}</span>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">来源：{task.source}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">下一步：{task.nextAction}</p>
                      {task.notes && task.notes !== "-" ? <p className="mt-1 text-sm leading-6 text-slate-600">备注：{task.notes}</p> : null}
                      <p className="mt-1 text-xs text-slate-500">创建时间：{formatEasternTime(task.createdAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">最近更新：{formatEasternTime(task.updatedAt)}</p>
                      {task.blockedBy && task.blockedBy !== "-" ? (
                        task.status === "blocked" ? (
                          <p className="mt-2 text-sm leading-6 text-rose-700">阻塞原因：{task.blockedBy}</p>
                        ) : (
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">系统备注</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{task.blockedBy}</p>
                          </div>
                        )
                      ) : null}
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">最近动作 · {relatedEvents.length} 条</p>
                        {relatedEvents.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {relatedEvents.map((event, index) => (
                              <div key={`${event.stamp}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                <span className="font-medium text-slate-800">{displayEventType(event.type)}</span>
                                <span className="mx-2 text-slate-400">·</span>
                                <span>{event.result}</span>
                                <span className="mx-2 text-slate-300">·</span>
                                <span>{event.actor}</span>
                                <span className="mx-2 text-slate-300">·</span>
                                <span className="text-slate-400">{event.stamp}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">暂无最近动作</div>
                        )}
                      </div>

                      <form action="/api/task-owner" method="POST" className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="returnTo" value={`/dashboard/tasks?taskFilter=${taskFilter}`} />
                        <span className="text-xs font-semibold text-slate-600">负责人</span>
                        <select name="owner" defaultValue={task.owner} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 outline-none">
                          {["阿三", "阿本", "小四", "西风", "零号", "待定"].map((owner) => (
                            <option key={owner} value={owner}>{owner}</option>
                          ))}
                        </select>
                        <button type="submit" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100">
                          更新负责人
                        </button>
                      </form>

                      <form action="/api/task-status" method="POST" className="mt-3 flex flex-wrap gap-2">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="returnTo" value={`/dashboard/tasks?taskFilter=${taskFilter}`} />
                        {[
                          ["new", "待开始"],
                          ["claimed", "已认领"],
                          ["in_progress", "进行中"],
                          ["blocked", "阻塞"],
                          ["done", "已完成"],
                          ["dropped", "已放弃"],
                        ].map(([value, label]) => {
                          const isActive = task.status === value;
                          return (
                            <button
                              key={value}
                              type="submit"
                              name="status"
                              value={value}
                              disabled={isActive}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                isActive
                                  ? `${statusTone(value)} cursor-default border-transparent`
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {isActive ? `当前：${label}` : label}
                            </button>
                          );
                        })}
                      </form>

                      <form action="/api/task-meta" method="POST" className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="returnTo" value={`/dashboard/tasks?taskFilter=${taskFilter}`} />
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <label className="text-xs font-medium text-slate-600">
                            下一步
                            <input
                              name="nextAction"
                              defaultValue={task.nextAction === "-" ? "" : task.nextAction}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            阻塞说明
                            <input
                              name="blockedBy"
                              defaultValue={task.blockedBy === "-" ? "" : task.blockedBy}
                              placeholder="没有就留空"
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600 xl:col-span-1 sm:col-span-2">
                            备注
                            <input
                              name="notes"
                              defaultValue={task.notes === "-" ? "" : task.notes}
                              placeholder="补充说明"
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none"
                            />
                          </label>
                        </div>
                        <button type="submit" className="mt-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100">
                          更新任务说明
                        </button>
                      </form>
                    </div>
                  );
                }) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">{emptyStateLabel}</div>
                )}
              </div>
            </DashboardCard>

            <section className="space-y-4">
              <DashboardCard>
                <DashboardCardTitle
                  title="TODO 联动"
                  desc="把老板视角的开放待办，提升成正式任务"
                  right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{activeTodos.length} 条</span>}
                />
                <div className="mt-4 grid gap-3">
                  {activeTodos.slice(0, 6).map((todo) => {
                    const linkedCount = tasks.filter((task) => `${task.source} ${task.notes} ${task.title}`.includes(todo.id)).length;
                    return (
                      <div key={todo.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{todo.id} · {todo.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{todo.status}</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">已挂任务 {linkedCount}</span>
                        </div>
                        {todo.goal !== "-" ? <p className="mt-3 text-sm leading-6 text-slate-600">目标：{todo.goal}</p> : null}
                        {todo.nextStep !== "-" ? <p className="mt-1 text-sm leading-6 text-slate-600">下一步：{todo.nextStep}</p> : null}
                        <form action="/api/task-create" method="POST" className="mt-3">
                          <input type="hidden" name="title" value={`${todo.title}`} />
                          <input type="hidden" name="owner" value="待定" />
                          <input type="hidden" name="priority" value="P2" />
                          <input type="hidden" name="source" value={`TODO.md / ${todo.id}`} />
                          <input type="hidden" name="nextAction" value={todo.nextStep !== "-" ? todo.nextStep : "待补充"} />
                          <input type="hidden" name="notes" value={todo.goal !== "-" ? `来自 ${todo.id}；目标：${todo.goal}` : `来自 ${todo.id}`} />
                          <input type="hidden" name="returnTo" value={`/dashboard/tasks?taskFilter=${taskFilter}`} />
                          <button type="submit" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100">
                            提升成正式任务
                          </button>
                        </form>
                      </div>
                    );
                  })}
                  {activeTodos.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">当前没有进行中的 TODO 条目</div>
                  ) : null}
                </div>
              </DashboardCard>

              <DashboardCard>
                <DashboardCardTitle title="任务判断规则" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["正式任务", "必须进入任务队列，不能把所有聊天都算成执行中"],
                    ["进行中", "已经明确 owner 并有下一步动作"],
                    ["阻塞", "必须写出卡点，而不是只写稍等"],
                    ["待处理", "还没真正进入执行，但已经进入正式管理"],
                  ].map(([title, desc]) => (
                    <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">{title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
                    </div>
                  ))}
                </div>
              </DashboardCard>

              <DashboardCard>
                <DashboardCardTitle title="下一步入口" desc="任务台之外的常用跳转" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <a href="/dashboard/overview" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-900">回总览页</a>
                  <a href="/dashboard/system" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-900">看系统页</a>
                </div>
              </DashboardCard>
            </section>
          </div>
    </div>
  );
}
