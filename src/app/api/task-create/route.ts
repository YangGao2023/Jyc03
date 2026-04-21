import { NextResponse } from "next/server";
import { appendEvent, nextTaskId, nowStamp, readTaskQueue, writeTaskQueue } from "@/lib/task-board";

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

  const raw = readTaskQueue();
  const taskId = nextTaskId(raw);
  const stamp = nowStamp();
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

  writeTaskQueue(raw.trimEnd() + `\n\n${block}\n`);
  appendEvent(taskId, "task_created", `created task; owner=${owner}; priority=${priority}; next=${nextAction}`);

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: returnTo.startsWith("/") ? returnTo : "/dashboard/tasks",
    },
  });
}
