import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const TASK_QUEUE_PATH = path.join(process.cwd(), "..", "共享协作区", "任务", "任务队列.md");
const EVENT_STREAM_PATH = path.join(process.cwd(), "..", "共享协作区", "日志", "事件流.md");

function updateTaskField(raw: string, taskId: string, field: string, value: string) {
  const escapedTaskId = taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRegex = new RegExp(`(### \\[${escapedTaskId}\\][\\s\\S]*?)(?=\\n### \\[TASK-|$)`, "m");
  const blockMatch = raw.match(blockRegex);
  if (!blockMatch) {
    return null;
  }

  const block = blockMatch[1];
  const fieldRegex = new RegExp(`^- ${field}:.*$`, "m");
  const nextBlock = fieldRegex.test(block)
    ? block.replace(fieldRegex, `- ${field}: ${value}`)
    : `${block.trimEnd()}\n- ${field}: ${value}\n`;

  return raw.replace(block, nextBlock);
}

function appendEvent(taskId: string, nextAction: string, blockedBy: string) {
  const raw = readFileSync(EVENT_STREAM_PATH, "utf8");
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const result = blockedBy
    ? `next_action updated; blocked_by=${blockedBy}`
    : `next_action updated; blocked_by cleared`;
  const entry = `- [${stamp}] actor=阿三 type=decision task=${taskId} result=${result}; next=${nextAction}`;
  writeFileSync(EVENT_STREAM_PATH, raw.trimEnd() + `\n${entry}\n`, "utf8");
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const taskId = String(formData.get("taskId") || "").trim();
  const nextAction = String(formData.get("nextAction") || "").trim();
  const blockedBy = String(formData.get("blockedBy") || "").trim();
  const returnTo = String(formData.get("returnTo") || "/dashboard/tasks").trim();

  if (!taskId) {
    return NextResponse.json({ ok: false, error: "Missing taskId" }, { status: 400 });
  }

  const raw = readFileSync(TASK_QUEUE_PATH, "utf8");
  const previousStatus = raw.match(new RegExp(`### \\[${taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][\\s\\S]*?(?=\\n### \\[TASK-|$)`, "m"))?.[0]
    ?.split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("- status:"))
    ?.split(":").slice(1).join(":").trim() || null;
  const updatedNext = updateTaskField(raw, taskId, "next_action", nextAction || "待补充");
  if (!updatedNext) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const updatedBlocked = updateTaskField(updatedNext, taskId, "blocked_by", blockedBy || "");
  const autoBlocked = blockedBy && previousStatus !== "done" ? updateTaskField(updatedBlocked || updatedNext, taskId, "status", "blocked") : updatedBlocked || updatedNext;
  const stamped = updateTaskField(autoBlocked || updatedBlocked || updatedNext, taskId, "updated_at", new Date().toISOString().slice(0, 16).replace("T", " "));
  writeFileSync(TASK_QUEUE_PATH, stamped || autoBlocked || updatedBlocked || updatedNext, "utf8");
  appendEvent(taskId, nextAction || "待补充", blockedBy);

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: returnTo.startsWith("/") ? returnTo : "/dashboard/tasks",
    },
  });
}
