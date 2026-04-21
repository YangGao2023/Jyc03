import { NextResponse } from "next/server";
import { appendEvent, nowStamp, readTaskField, readTaskQueue, updateTaskField, writeTaskQueue } from "@/lib/task-board";

export async function POST(request: Request) {
  const formData = await request.formData();
  const taskId = String(formData.get("taskId") || "").trim();
  const status = String(formData.get("status") || "").trim();
  const returnTo = String(formData.get("returnTo") || "/dashboard/tasks").trim();

  if (!taskId || !status) {
    return NextResponse.json({ ok: false, error: "Missing taskId or status" }, { status: 400 });
  }

  const raw = readTaskQueue();
  const previousStatus = readTaskField(raw, taskId, "status");
  const updated = updateTaskField(raw, taskId, "status", status);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const clearedBlocked = status === "done" ? updateTaskField(updated, taskId, "blocked_by", "") : updated;
  const stamped = updateTaskField(clearedBlocked || updated, taskId, "updated_at", nowStamp());
  writeTaskQueue(stamped || clearedBlocked || updated);
  const eventType = status === "done" ? "completed" : status === "blocked" ? "blocked" : "status_change";
  appendEvent(taskId, eventType, `status ${previousStatus || "unknown"} -> ${status}`);

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: returnTo.startsWith("/") ? returnTo : "/dashboard/tasks",
    },
  });
}
