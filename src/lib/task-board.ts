import { writeFileSync } from "node:fs";
import path from "node:path";
import { safeRead } from "@/lib/fs-utils";

export type TaskCard = {
  id: string;
  title: string;
  owner: string;
  priority: string;
  status: string;
  source: string;
  blockedBy: string;
  nextAction: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type EventItem = {
  stamp: string;
  actor: string;
  type: string;
  task: string;
  result: string;
};

export const TASK_QUEUE_PATH = path.join(process.cwd(), "..", "共享协作区", "任务", "任务队列.md");
export const EVENT_STREAM_PATH = path.join(process.cwd(), "..", "共享协作区", "日志", "事件流.md");

export function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

export function getSortValue(value: string) {
  const normalized = value.trim();
  const parsed = Date.parse(normalized.replace(" ", "T"));
  return Number.isNaN(parsed) ? normalized : parsed;
}

export function parseTaskQueue(raw: string): TaskCard[] {
  return raw
    .split(/\r?\n(?=### \[TASK-)/)
    .filter((block) => /^### \[TASK-\d+\]/.test(block.trim()))
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const heading = lines[0] || "";
      const match = heading.match(/^### \[(TASK-\d+)\]\s+(.+)$/);
      const getField = (name: string) =>
        lines.find((line) => line.trim().startsWith(`- ${name}:`))?.split(":").slice(1).join(":").trim() || "-";

      return {
        id: match?.[1] || "TASK-???",
        title: match?.[2] || "未命名任务",
        owner: getField("owner"),
        priority: getField("priority"),
        status: getField("status"),
        source: getField("source"),
        blockedBy: getField("blocked_by"),
        nextAction: getField("next_action"),
        notes: getField("notes"),
        createdAt: getField("created_at"),
        updatedAt: getField("updated_at"),
      };
    });
}

export function parseEventStream(raw: string): EventItem[] {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("- ["))
    .map((line) => {
      const match = line.match(/^\- \[(.+?)\]\s+actor=(.+?)\s+type=(.+?)\s+task=(.+?)\s+result=(.+)$/);
      return {
        stamp: match?.[1] || "未知时间",
        actor: match?.[2] || "未知",
        type: match?.[3] || "unknown",
        task: match?.[4] || "-",
        result: match?.[5] || line.trim(),
      };
    });
}

export function displayTaskEventType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "status_change") return "状态变更";
  if (normalized === "task_created") return "任务创建";
  if (normalized === "task_claimed") return "任务认领";
  if (normalized === "handoff") return "交接";
  if (normalized === "decision") return "决策";
  if (normalized === "memory_promoted") return "记忆提升";
  if (normalized === "blocked") return "阻塞";
  if (normalized === "completed") return "完成";
  if (normalized === "unknown") return "未知事件";
  return value;
}

export function taskEventTone(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "status_change") return "bg-sky-100 text-sky-800";
  if (normalized === "task_created") return "bg-cyan-100 text-cyan-800";
  if (normalized === "task_claimed") return "bg-fuchsia-100 text-fuchsia-800";
  if (normalized === "memory_promoted") return "bg-indigo-100 text-indigo-800";
  if (normalized === "blocked") return "bg-rose-100 text-rose-800";
  if (normalized === "handoff") return "bg-violet-100 text-violet-800";
  if (normalized === "decision") return "bg-amber-100 text-amber-800";
  if (normalized === "completed") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

export function readTaskQueue() {
  return safeRead(TASK_QUEUE_PATH);
}

export function countTaskItems(raw = readTaskQueue()) {
  return raw.split(/\r?\n/).filter((line) => /^### \[TASK-/.test(line.trim())).length;
}

export function countBlockedTaskItems(raw = readTaskQueue()) {
  return raw.split(/\r?\n/).filter((line) => line.includes("- status: blocked")).length;
}

export function readEventStream() {
  return safeRead(EVENT_STREAM_PATH);
}

export function countEventItems(raw = readEventStream()) {
  return raw.split(/\r?\n/).filter((line) => line.trim().startsWith("- [")).length;
}

export function nextTaskId(raw: string) {
  const ids = [...raw.matchAll(/### \[TASK-(\d+)\]/g)].map((match) => Number(match[1]));
  const max = ids.length > 0 ? Math.max(...ids) : 0;
  return `TASK-${String(max + 1).padStart(3, "0")}`;
}

export function readTaskField(raw: string, taskId: string, field: string) {
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

export function updateTaskField(raw: string, taskId: string, field: string, value: string) {
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

export function writeTaskQueue(raw: string) {
  writeFileSync(TASK_QUEUE_PATH, raw, "utf8");
}

export function appendEvent(taskId: string, type: string, result: string, actor = "阿三") {
  const raw = readEventStream();
  const entry = `- [${nowStamp()}] actor=${actor} type=${type} task=${taskId} result=${result}`;
  writeFileSync(EVENT_STREAM_PATH, raw.trimEnd() + `\n${entry}\n`, "utf8");
}
