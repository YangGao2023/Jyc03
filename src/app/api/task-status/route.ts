import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const TASK_QUEUE_PATH = path.join(process.cwd(), "..", "共享协作区", "任务", "任务队列.md");
const EVENT_STREAM_PATH = path.join(process.cwd(), "..", "共享协作区", "日志", "事件流.md");

function readTaskField(raw: string, taskId: string, field: string) {
  const escapedTaskId = taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRegex = new RegExp(`### \\[${escapedTaskId}\\][\\s\\S]*?(?=\\n### \\[TASK-|$)`, "m");
  const blockMatch = raw.match(blockRegex);
  if (!blockMatch) {
    return null;
  }

  const line = blockMatch[0]
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`- ${field}:`));
  return line ? line.split(":").slice(1).join(":").trim() : null;
}

function appendEvent(taskId: string, fromStatus: string | null, toStatus: string) {
  const raw = readFileSync(EVENT_STREAM_PATH, "utf8");
  const stamp = new Date();
  const pretty = stamp.toISOString().slice(0, 16).replace("T", " ");
  const entry = `- [${pretty}] actor=阿三 type=status_change task=${taskId} result=status ${fromStatus || "unknown"} -> ${toStatus}`;
  const next = raw.trimEnd() + `\n${entry}\n`;
  writeFileSync(EVENT_STREAM_PATH, next, "utf8");
}

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

export async function POST(request: Request) {
  const formData = await request.formData();
  const taskId = String(formData.get("taskId") || "").trim();
  const status = String(formData.get("status") || "").trim();
  const returnTo = String(formData.get("returnTo") || "/dashboard/tasks").trim();

  if (!taskId || !status) {
    return NextResponse.json({ ok: false, error: "Missing taskId or status" }, { status: 400 });
  }

  const raw = readFileSync(TASK_QUEUE_PATH, "utf8");
  const previousStatus = readTaskField(raw, taskId, "status");
  const updated = updateTaskField(raw, taskId, "status", status);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const clearedBlocked = status === "done" ? updateTaskField(updated, taskId, "blocked_by", "") : updated;
  const stamped = updateTaskField(clearedBlocked || updated, taskId, "updated_at", new Date().toISOString().slice(0, 16).replace("T", " "));
  writeFileSync(TASK_QUEUE_PATH, stamped || clearedBlocked || updated, "utf8");
  appendEvent(taskId, previousStatus, status);

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: returnTo.startsWith("/") ? returnTo : "/dashboard/tasks",
    },
  });
}
