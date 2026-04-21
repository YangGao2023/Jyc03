import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const TASK_QUEUE_PATH = path.join(process.cwd(), "..", "共享协作区", "任务", "任务队列.md");
const EVENT_STREAM_PATH = path.join(process.cwd(), "..", "共享协作区", "日志", "事件流.md");

function nextTaskId(raw: string) {
  const ids = [...raw.matchAll(/### \[TASK-(\d+)\]/g)].map((match) => Number(match[1]));
  const max = ids.length > 0 ? Math.max(...ids) : 0;
  return `TASK-${String(max + 1).padStart(3, "0")}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const title = String(formData.get("title") || "").trim();
  const owner = String(formData.get("owner") || "待定").trim() || "待定";
  const priority = String(formData.get("priority") || "P2").trim() || "P2";
  const source = String(formData.get("source") || "老板后台新增任务").trim() || "老板后台新增任务";
  const nextAction = String(formData.get("nextAction") || "待补充").trim() || "待补充";
  const notes = String(formData.get("notes") || "").trim();
  const returnTo = String(formData.get("returnTo") || "/dashboard/tasks").trim();

  if (!title) {
    return NextResponse.json({ ok: false, error: "Missing title" }, { status: 400 });
  }

  const raw = readFileSync(TASK_QUEUE_PATH, "utf8");
  const taskId = nextTaskId(raw);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const status = owner !== "待定" ? "claimed" : "new";
  const block = [
    `### [${taskId}] ${title}`,
    `- owner: ${owner}`,
    `- priority: ${priority}`,
    `- status: ${status}`,
    `- source: ${source}`,
    `- created_at: ${stamp}`,
    `- updated_at: ${stamp}`,
    `- blocked_by: `,
    `- next_action: ${nextAction}`,
    `- notes: ${notes}`,
  ].join("\n");

  writeFileSync(TASK_QUEUE_PATH, raw.trimEnd() + `\n\n${block}\n`, "utf8");

  const eventRaw = readFileSync(EVENT_STREAM_PATH, "utf8");
  const entry = `- [${stamp}] actor=阿三 type=decision task=${taskId} result=created task; owner=${owner}; priority=${priority}; next=${nextAction}`;
  writeFileSync(EVENT_STREAM_PATH, eventRaw.trimEnd() + `\n${entry}\n`, "utf8");

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: returnTo.startsWith("/") ? returnTo : "/dashboard/tasks",
    },
  });
}
