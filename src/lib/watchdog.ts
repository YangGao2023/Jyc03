import { readAgentStatuses } from "@/lib/agent-status";
import { readPromises } from "@/lib/promise-store";
import { readProofs } from "@/lib/proof-store";
import { readWakeQueue } from "@/lib/wake-store";

export type WatchdogAlert = {
  kind: "stale_agent" | "overdue_promise" | "blocked_promise" | "missing_proof" | "pending_wake";
  level: "warn" | "error";
  title: string;
  detail: string;
  target?: string;
  relatedId?: string;
};

export async function computeWatchdogAlerts() {
  const [agentStatuses, promises, proofs, wakeItems] = await Promise.all([
    readAgentStatuses().catch(() => []),
    readPromises().catch(() => []),
    readProofs().catch(() => []),
    readWakeQueue().catch(() => []),
  ]);

  const now = Date.now();
  const alerts: WatchdogAlert[] = [];

  for (const item of agentStatuses) {
    const updatedAt = Date.parse(item.updatedAt || "");
    if (Number.isFinite(updatedAt) && now - updatedAt > 30 * 60 * 1000) {
      alerts.push({
        kind: "stale_agent",
        level: "warn",
        title: `${item.agent} 超时未更新`,
        detail: `${item.agent} 超过 30 分钟没有新的 heartbeat/status。`,
        target: item.agent,
      });
    }
  }

  for (const item of promises) {
    if (item.status === "blocked") {
      alerts.push({
        kind: "blocked_promise",
        level: "error",
        title: `${item.title} 已阻塞`,
        detail: item.blockedReason || "Promise 当前处于 blocked 状态。",
        target: item.owner,
        relatedId: item.id,
      });
    }
    if (item.nextCheckAt && !["completed", "expired"].includes(item.status) && Date.parse(item.nextCheckAt) < now) {
      alerts.push({
        kind: "overdue_promise",
        level: "warn",
        title: `${item.title} 已超时`,
        detail: `Promise 已超过 next_check_at，owner=${item.owner}。`,
        target: item.owner,
        relatedId: item.id,
      });
    }
    if (item.status === "completed") {
      const hasProof = proofs.some((proof) => proof.promiseId === item.id);
      if (!hasProof) {
        alerts.push({
          kind: "missing_proof",
          level: "warn",
          title: `${item.title} 缺少证据`,
          detail: `Promise 已标记 completed，但还没有 proof 记录。`,
          target: item.owner,
          relatedId: item.id,
        });
      }
    }
  }

  for (const item of wakeItems) {
    if (!item.consumedAt) {
      alerts.push({
        kind: "pending_wake",
        level: "warn",
        title: `${item.targetAgent} 有未处理唤醒项`,
        detail: `${item.kind} 仍未 consumed。`,
        target: item.targetAgent,
        relatedId: item.id,
      });
    }
  }

  return alerts;
}
