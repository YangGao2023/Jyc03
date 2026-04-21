import { NextResponse } from "next/server";
import { appendEvent, nowStamp, readTaskField, readTaskQueue, updateTaskField, writeTaskQueue } from "@/lib/task-board";

export async function POST(request: Request) {
  const formData = await request.formData();
  const taskId = String(formData.get("taskId") || "").trim();
  const owner = String(formData.get("owner") || "").trim();
  const returnTo = String(formData.get("returnTo") || "/dashboard/tasks").trim();

  if (!taskId || !owner) {
    return NextResponse.json({ ok: false, error: "Missing taskId or owner" }, { status: 400 });
  }

  const raw = readTaskQueue();
  const previousOwner = readTaskField(raw, taskId, "owner");
  const previousStatus = readTaskField(raw, taskId, "status");
  const updated = updateTaskField(raw, taskId, "owner", owner);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const autoClaimed = owner !== "待定" && previousStatus === "new" ? updateTaskField(updated, taskId, "status", "claimed") : updated;
  const stamped = updateTaskField(autoClaimed || updated, taskId, "updated_at", nowStamp());
  writeTaskQueue(stamped || autoClaimed || updated);
  appendEvent(taskId, previousOwner === "待定" ? "task_claimed" : "handoff", `owner ${previousOwner || "unknown"} -> ${owner}`);

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: returnTo.startsWith("/") ? returnTo : "/dashboard/tasks",
    },
  });
}
