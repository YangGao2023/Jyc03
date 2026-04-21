import { NextResponse } from "next/server";
import { appendEvent, nowStamp, readTaskField, readTaskQueue, updateTaskField, writeTaskQueue } from "@/lib/task-board";

export async function POST(request: Request) {
  const formData = await request.formData();
  const taskId = String(formData.get("taskId") || "").trim();
  const nextAction = String(formData.get("nextAction") || "").trim();
  const blockedBy = String(formData.get("blockedBy") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const returnTo = String(formData.get("returnTo") || "/dashboard/tasks").trim();

  if (!taskId) {
    return NextResponse.json({ ok: false, error: "Missing taskId" }, { status: 400 });
  }

  const raw = readTaskQueue();
  const previousStatus = readTaskField(raw, taskId, "status");
  const updatedNext = updateTaskField(raw, taskId, "next_action", nextAction || "待补充");
  if (!updatedNext) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const updatedBlocked = updateTaskField(updatedNext, taskId, "blocked_by", blockedBy || "");
  const updatedNotes = updateTaskField(updatedBlocked || updatedNext, taskId, "notes", notes || "");
  const autoBlocked = blockedBy && previousStatus !== "done" ? updateTaskField(updatedNotes || updatedBlocked || updatedNext, taskId, "status", "blocked") : updatedNotes || updatedBlocked || updatedNext;
  const stamped = updateTaskField(autoBlocked || updatedNotes || updatedBlocked || updatedNext, taskId, "updated_at", nowStamp());
  writeTaskQueue(stamped || autoBlocked || updatedNotes || updatedBlocked || updatedNext);
  appendEvent(taskId, "decision", `next_action updated; blocked_by=${blockedBy || "cleared"}; notes=${notes || "cleared"}; next=${nextAction || "待补充"}`);

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: returnTo.startsWith("/") ? returnTo : "/dashboard/tasks",
    },
  });
}
