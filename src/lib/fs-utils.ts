import { existsSync, readFileSync } from "node:fs";

export function safeRead(filePath: string, fallback = "") {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : fallback;
}
