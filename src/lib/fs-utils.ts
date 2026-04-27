import { existsSync, readFileSync } from "node:fs";

export function safeRead(filePath: string, fallback = "") {
  if (!existsSync(filePath)) return fallback;

  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

export function parseLimit(raw: string | null, fallback = 20, max = 50) {
  const parsed = Number(raw ?? fallback);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, parsed)) : fallback;
}
