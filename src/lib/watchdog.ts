import { enqueueMessage, readQueue } from "@/lib/agent-bridge";
import { readAgentStatuses } from "@/lib/agent-status";
import { readPromises } from "@/lib/promise-store";
import { readProofs } from "@/lib/proof-store";
import { makeWakeId, readWakeQueue, upsertWakeItem } from "@/lib/wake-store";

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
        detail: `${item.blockedReason || "Promise 当前处于 blocked 状态。"}${item.backup ? ` backup=${item.backup}` : ""}`,
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

export async function runWatchdogActions() {
  const [alerts, wakeItems, outbox] = await Promise.all([
    computeWatchdogAlerts(),
    readWakeQueue().catch(() => []),
    readQueue("outbox").catch(() => []),
  ]);

  const actions: string[] = [];

  for (const alert of alerts) {
    if (!alert.relatedId || !alert.target) {
      continue;
    }

    if (alert.kind === "overdue_promise") {
      const wakeId = `WAKE-OVERDUE-${alert.relatedId}-${alert.target}`;
      const hasWake = wakeItems.some((item) => item.id === wakeId);
      if (!hasWake) {
        await upsertWakeItem({
          id: wakeId,
          targetAgent: alert.target,
          kind: "overdue_followup",
          relatedId: alert.relatedId,
          priority: "high",
          createdAt: new Date().toISOString(),
          note: alert.detail,
        });
        actions.push(`wake:${wakeId}`);
      }

      const hasMessage = outbox.some(
        (item) => item.kind === "watchdog_overdue" && item.to === alert.target && item.meta?.relatedId === alert.relatedId,
      );
      if (!hasMessage) {
        await enqueueMessage("outbox", {
          from: "watchdog",
          to: alert.target,
          kind: "watchdog_overdue",
          text: alert.title,
          meta: { relatedId: alert.relatedId, detail: alert.detail },
        });
        actions.push(`outbox:owner:${alert.relatedId}`);
      }
    }

    if (alert.kind === "blocked_promise") {
      const backupMatch = alert.detail.match(/backup=([^,\s]+)/i);
      const backup = backupMatch?.[1]?.trim();
      if (!backup) {
        continue;
      }
      const wakeId = `WAKE-BLOCKED-${alert.relatedId}-${backup}`;
      const hasWake = wakeItems.some((item) => item.id === wakeId);
      if (!hasWake) {
        await upsertWakeItem({
          id: wakeId,
          targetAgent: backup,
          kind: "blocked_handoff",
          relatedId: alert.relatedId,
          priority: "high",
          createdAt: new Date().toISOString(),
          note: alert.detail,
        });
        actions.push(`wake:backup:${wakeId}`);
      }

      const hasMessage = outbox.some(
        (item) => item.kind === "watchdog_blocked" && item.to === backup && item.meta?.relatedId === alert.relatedId,
      );
      if (!hasMessage) {
        await enqueueMessage("outbox", {
          from: "watchdog",
          to: backup,
          kind: "watchdog_blocked",
          text: alert.title,
          meta: { relatedId: alert.relatedId, detail: alert.detail },
        });
        actions.push(`outbox:backup:${alert.relatedId}`);
      }
    }
  }

  return { alerts, actions };
}
