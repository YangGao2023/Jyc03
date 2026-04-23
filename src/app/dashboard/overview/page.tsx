import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { DashboardCard, DashboardCardTitle, DashboardPageHeader } from "../components";
import { appendEvent, readEventChain } from "@/lib/event-store";
import { makePromiseId, readPromises, upsertPromise } from "@/lib/promise-store";
import { appendProof, makeProofId, readProofs } from "@/lib/proof-store";
import { formatEasternTime } from "@/lib/time";
import { readWakeQueue, upsertWakeItem } from "@/lib/wake-store";
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

async function createPromiseAction(formData: FormData) {
  "use server";

  const title = String(formData.get("title") || "").trim();
  const owner = String(formData.get("owner") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const backup = String(formData.get("backup") || "").trim();

  if (!title || !owner) {
    return;
  }

  const createdAt = new Date().toISOString();
  const itemId = makePromiseId();
  await upsertPromise({
    id: itemId,
    kind: "owner_created",
    title,
    description: description || undefined,
    owner,
    backup: backup || undefined,
    createdBy: "YANG",
    createdAt,
    status: "promised",
    latestProgressAt: createdAt,
  });

  await appendEvent({
    actor: "YANG",
    target: owner,
    promiseId: itemId,
    type: "promise_created",
    result: "ok",
    summary: `Owner created promise: ${title}`,
  });

  revalidatePath("/dashboard/overview");
}

async function handoffPromiseAction(formData: FormData) {
  "use server";

  const promiseId = String(formData.get("promiseId") || "").trim();
  const nextOwner = String(formData.get("nextOwner") || "").trim();
  if (!promiseId || !nextOwner) {
    return;
  }

  const promises = await readPromises();
  const current = promises.find((item) => item.id === promiseId);
  if (!current || current.owner === nextOwner || current.status === "completed") {
    return;
  }

  const handedAt = new Date().toISOString();
  await upsertPromise({
    ...current,
    owner: nextOwner,
    backup: current.owner,
    status: "handed_off",
    latestProgressAt: handedAt,
    blockedReason: undefined,
  });

  await upsertWakeItem({
    id: `WAKE-HANDOFF-${promiseId}-${nextOwner}`,
    targetAgent: nextOwner,
    kind: "owner_handoff",
    relatedId: promiseId,
    priority: "high",
    createdAt: handedAt,
    note: `Owner handoff from ${current.owner} to ${nextOwner}`,
  });

  await appendEvent({
    actor: "YANG",
    target: nextOwner,
    promiseId,
    type: "owner_handoff",
    result: "ok",
    summary: `Owner handoff: ${current.owner} -> ${nextOwner} (${current.title})`,
  });

  revalidatePath("/dashboard/overview");
}

async function completePromiseAction(formData: FormData) {
  "use server";

  const promiseId = String(formData.get("promiseId") || "").trim();
  if (!promiseId) {
    return;
  }

  const promises = await readPromises();
  const current = promises.find((item) => item.id === promiseId);
  if (!current || current.status === "completed") {
    return;
  }

  const completedAt = new Date().toISOString();
  await upsertPromise({
    ...current,
    status: "completed",
    latestProgressAt: completedAt,
    latestProofSummary: `owner completed at ${completedAt}`,
    blockedReason: undefined,
  });

  await appendProof({
    id: makeProofId(),
    promiseId,
    proofType: "owner_completion",
    createdAt: completedAt,
    createdBy: "YANG",
    summary: `Owner marked promise complete: ${current.title}`,
  });

  await appendEvent({
    actor: "YANG",
    target: current.owner,
    promiseId,
    type: "promise_completed",
    result: "ok",
    summary: `Owner marked complete: ${current.title}`,
  });

  await appendEvent({
    actor: "YANG",
    target: current.owner,
    promiseId,
    type: "proof_generated",
    result: "ok",
    summary: `Completion proof generated for ${current.title}`,
  });

  revalidatePath("/dashboard/overview");
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
  const events = await readEventChain().catch(() => []);

  const todoCount = countMatches(todoRaw, /^### \[TODO-/);
  const taskCount = countMatches(taskRaw, /^### \[TASK-/);
  const handoffCount = countMatches(handoffRaw, /^### /);
  const recentEvents = parseRecentEvents(eventRaw);
  const totalEventCount = countMatches(eventRaw, /^- \[/);
  const openPromises = promises.filter((item) => !["completed", "expired"].includes(item.status));
  const activePromises = openPromises.length;
  const blockedPromises = promises.filter((item) => item.status === "blocked").length;
  const overduePromises = promises.filter((item) => item.nextCheckAt && Date.parse(item.nextCheckAt) < Date.now() && !["completed", "expired"].includes(item.status)).length;
  const recentProofs = proofs.slice(0, 4);
  const recentWakeItems = wakeItems.slice(0, 4);
  const recentAlerts = alerts.slice(0, 5);
  const recentEventChain = events.slice(0, 8);

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

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <DashboardCard>
            <DashboardCardTitle title="Promise 可操作化" desc="先把老板最常用的两刀落地：创建 Promise、标记完成。" right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{promises.length} 条</span>} />
            <form action={createPromiseAction} className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
              <input name="title" placeholder="Promise 标题" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" required />
              <input name="owner" placeholder="Owner，例如 阿三 / 零号" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" required />
              <input name="backup" placeholder="Backup，可选" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
              <input name="description" placeholder="备注，可选" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">创建 Promise</button>
              </div>
            </form>
            <div className="mt-4 grid gap-3">
              {openPromises.length > 0 ? openPromises.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.id} · owner: {item.owner} · backup: {item.backup || "-"}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${promiseTone(item.status)}`}>{item.status}</span>
                  </div>
                  {item.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">创建时间：{formatEasternTime(item.createdAt)}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={handoffPromiseAction} className="flex items-center gap-2">
                        <input type="hidden" name="promiseId" value={item.id} />
                        <input name="nextOwner" defaultValue={item.backup || ""} placeholder="移交给谁" className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                        <button type="submit" className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700">强制移交</button>
                      </form>
                      <form action={completePromiseAction}>
                        <input type="hidden" name="promiseId" value={item.id} />
                        <button type="submit" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">标记完成</button>
                      </form>
                    </div>
                  </div>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">当前没有打开中的 Promise。</div>}
            </div>
          </DashboardCard>

          <DashboardCard>
            <DashboardCardTitle title="事件链" desc="老板能直接看到谁触发了谁、挂在哪个 Promise、结果是什么。" right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{events.length} 条</span>} />
            <div className="mt-4 grid gap-3">
              {recentEventChain.length > 0 ? recentEventChain.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.type}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${item.result === "ok" ? "bg-emerald-100 text-emerald-800" : item.result === "failed" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{item.result}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{formatEasternTime(item.timestamp)} · actor: {item.actor} · target: {item.target || "-"} · promise: {item.promiseId || "-"}</p>
                  {item.summary ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p> : null}
                  {item.needsOwnerAttention ? <p className="mt-2 text-xs font-semibold text-rose-700">需要老板介入</p> : null}
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">当前还没有事件链记录。</div>}
            </div>
          </DashboardCard>

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
        </section>

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
                  <p className="mt-2 text-xs text-slate-500">created_by: {item.createdBy || "-"} · created_at: {formatEasternTime(item.createdAt)}</p>
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
