import path from "node:path";
import { safeRead } from "@/lib/task-board";

export type TodoItem = {
  id: string;
  title: string;
  goal: string;
  nextStep: string;
  status: string;
  section: "active" | "completed";
};

export const TODO_PATH = path.join(process.cwd(), "..", "共享协作区", "任务", "TODO.md");

export function readTodoBoard() {
  return safeRead(TODO_PATH);
}

export function parseTodoBoard(raw: string): TodoItem[] {
  const activePart = raw.split(/\n## 已完成/)[0] || raw;
  const completedPart = raw.includes("## 已完成") ? raw.split(/\n## 已完成/)[1] || "" : "";

  return [
    ...parseTodoSection(activePart, "active"),
    ...parseTodoSection(completedPart, "completed"),
  ];
}

function parseTodoSection(raw: string, section: "active" | "completed"): TodoItem[] {
  return raw
    .split(/\r?\n(?=### \[TODO-)/)
    .filter((block) => /^### \[TODO-\d+\]/.test(block.trim()))
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const heading = lines[0] || "";
      const match = heading.match(/^### \[(TODO-\d+)\]\s+(.+)$/);
      const getField = (name: string) =>
        lines.find((line) => line.trim().startsWith(`- ${name}：`))?.split("：").slice(1).join("：").trim() || "-";

      return {
        id: match?.[1] || "TODO-???",
        title: match?.[2] || "未命名待办",
        goal: getField("目标"),
        nextStep: getField("下一步"),
        status: getField("状态"),
        section,
      };
    });
}
