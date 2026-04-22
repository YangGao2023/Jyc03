import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DashboardCard, DashboardCardTitle, DashboardPageHeader } from "../components";
import { readPromises } from "@/lib/promise-store";
import { readProofs } from "@/lib/proof-store";
import { readWakeQueue } from "@/lib/wake-store";
import { computeWatchdogAlerts } from "@/lib/watchdog";

function safeRead(filePath: string) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function countMatches(raw: string, pattern: RegExp) {
  return raw.split(/\r?\n/).filter((line) => pattern.test(line.trim())).length;
}

function parseRecentEvents(raw: string) {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("- ["))
    .map((line) =>
      line
        .trim()
        .replace(/^\-\s+/, "")
        .replace(/^\[(.+?)\]/, "时间：$1")
        .replace(/\sactor=/g, " · 执行人：")
        .replace(/\stype=(\S+)/g, (_, type) => ` · 类型：${type}`)
        .replace(/\stask=/g, " · 任务编号：")
        .replace(/\sresult=/g, " · 结果：")
        .replace(/`/g, ""),
    )
    .slice(-5)
    .reverse();
}

function promiseTone(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["in_progress", "acknowledged"].includes(normalized)) return "bg-sky-100 text-sky-800";
  if (["completed"].includes(normalized)) return "bg-emerald-100 text-emerald-800";
  if (["blocked", "expired"].includes(normalized)) return "bg-rose-100 text-rose-800";
  if (["promised"].includes(normalized)) return "bg-amber-100 text-amber-800";
  if (["handed_off"].includes(normalized)) return "bg-violet-100 text-violet-800";
  return "bg-slate-100 text-slate-700";
}

function alertTone(value: string) {
  return value === "error" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800";
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
  const promises = await readPromises().catch(() => []);
  const proofs = await readProofs().catch(() => []);
  const wakeItems = await readWakeQueue().catch(() => []);
  const alerts = await computeWatchdogAlerts().catch(() => []);

  const todoCount = countMatches(todoRaw, /^### \[TODO-/);
  const taskCount = countMatches(taskRaw, /^### \[TASK-/);
  const handoffCount = countMatches(handoffRaw, /^### /);
  const recentEvents = parseRecentEvents(eventRaw);
  const totalEventCount = countMatches(eventRaw, /^- \[/);
  const activePromises = promises.filter((item) => !["completed", "expired"].includes(item.status)).length;
  const blockedPromises = promises.filter((item) => item.status === "blocked").length;
  const overduePromises = promises.filter((item) => item.nextCheckAt && Date.parse(item.nextCheckAt) < Date.now() && !["completed", "expired"].includes(item.status)).length;
  const recentProofs = proofs.slice(0, 4);
  const recentWakeItems = wakeItems.slice(0, 4);
  const recentAlerts = alerts.slice(0, 5);

  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(3,7,18,0.98))] p-4 shadow-2xl">
      <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
        <DashboardPageHeader
          eyebrow="Owner Backend · Overview"
          title="总览页"
          description="这一页开始把承诺、证据、醒来必读、督战告警都正式写进网站。"
          right={<a href="/dashboard" className="rounded-2xl border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-950">返回后台</a>}
        />

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">TODO</p><p className="mt-2 text-2xl font-semibold text-white">{todoCount}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">正式任务</p><p className="mt-2 text-2xl font-semibold text-white">{taskCount}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">进行中 Promise</p><p className="mt-2 text-2xl font-semibold text-white">{activePromises}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Watchdog 告警</p><p className="mt-2 text-2xl font-semibold text-white">{alerts.length}</p><p className="mt-1 text-xs text-slate-400">超时/阻塞 {overduePromises + blockedPromises}</p></div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DashboardCard>
          <DashboardCardTitle title="Watchdog 告警" desc="第一版督战层，开始自动找出 stale / overdue / missing proof。" right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{alerts.length} 条</span>} />
          <div className="mt-4 grid gap-3">
            {recentAlerts.length > 0 ? recentAlerts.map((item, index) => (
              <div key={`${item.kind}-${item.relatedId || index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${alertTone(item.level)}`}>{item.level}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                <p className="mt-1 text-xs text-slate-500">target: {item.target || "-"} · related: {item.relatedId || "-"}</p>
              </div>
            )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">当前没有 watchdog 告警。</div>}
          </div>
        </DashboardCard>

        <section className="space-y-4">
          <DashboardCard>
            <DashboardCardTitle title="WakeQueue / Startup Inbox" desc="开始把醒来必读的事项独立落层。" right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{wakeItems.length} 条</span>} />
            <div className="mt-4 grid gap-3">
              {recentWakeItems.length > 0 ? recentWakeItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.kind}</p>
                    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-800">{item.targetAgent}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{item.id} · priority: {item.priority || "-"} · related: {item.relatedId || "-"}</p>
                  {item.note ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.note}</p> : null}
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">还没有 wake queue 记录。</div>}
            </div>
          </DashboardCard>

          <DashboardCard>
            <DashboardCardTitle title="Proof / 证据" desc="开始把完成证据单独落层。" right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{proofs.length} 条</span>} />
            <div className="mt-4 grid gap-3">
              {recentProofs.length > 0 ? recentProofs.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.proofType}</p>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">{item.promiseId}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">created_by: {item.createdBy || "-"} · created_at: {item.createdAt}</p>
                  {item.summary ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p> : null}
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">还没有 proof 记录。</div>}
            </div>
          </DashboardCard>
        </section>
      </div>
    </div>
  );
}
