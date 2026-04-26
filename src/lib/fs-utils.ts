import { existsSync, readFileSync } from "node:fs";

export function safeRead(filePath: string, fallback = "") {
  if (!existsSync(filePath)) return fallback;

  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}
