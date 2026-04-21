import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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
  ["TODO", path.join(process.cwd(), "..", "共享协作区", "任务", "TODO.md")],
  ["错峰会议", path.join(process.cwd(), "..", "共享协作区", "交接", "错峰会议.md")],
  ["待接手任务", path.join(process.cwd(), "..", "共享协作区", "任务", "待接手任务.md")],
  ["共享长期记忆", path.join(process.cwd(), "..", "共享协作区", "记忆", "共享长期记忆.md")],
] as const;

export default async function DashboardMemoryPage() {
  const panels = docs.map(([label, file]) => ({ label, file, content: safeRead(file) }));
  const previewLines = 18;

  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(3,7,18,0.98))] p-4 shadow-2xl">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-sky-300">Owner Backend · Memory</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">记忆工作台</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">这一页只放老板最常看的共享资料，不把系统状态和正式任务掺进来。重点是 TODO、会议、待接手任务和共享长期记忆。</p>
              </div>
              <a href="/dashboard" className="rounded-2xl border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-950">返回后台</a>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {panels.map((panel) => (
                <div key={panel.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{panel.label}</p>
                    {isMissing(panel.content) ? <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800">缺失</span> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{panel.file.replace(`${process.cwd()}\\..\\`, "")}</p>
                  <p className="mt-2 text-xs text-slate-400">共 {countLines(panel.content)} 行</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {panels.map((panel) => (
              <section key={panel.label} className="rounded-[24px] bg-white p-4 text-slate-900 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-sky-700">{panel.label}</p>
                      {isMissing(panel.content) ? <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800">缺失</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{panel.file}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {countLines(panel.content) > previewLines ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">已截断</span> : null}
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{Math.min(previewLines, countLines(panel.content))} / {countLines(panel.content)} 行</span>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6">
                  {clipLines(panel.content, previewLines).map((line, index) => (
                    <div key={`${panel.label}-${index}`} className={`whitespace-pre-wrap ${lineTone(line)}`}>
                      {line || " "}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-4 rounded-[24px] bg-white p-4 text-slate-900 shadow-sm">
            <p className="text-sm font-medium text-sky-700">记忆页用途</p>
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
          </div>
    </div>
  );
}
