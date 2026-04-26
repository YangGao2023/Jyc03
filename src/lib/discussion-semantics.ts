import type { BridgeMessage } from "@/lib/agent-bridge";
import type { DiscussionStatus, DiscussionThread } from "@/lib/discussion-store";

export function extractTopicId(meta: Record<string, unknown> | null | undefined) {
  if (!meta) return "";
  const direct = String(meta.topicId || "").trim();
  if (direct) return direct;
  const commandMeta = meta.commandMeta;
  if (commandMeta && typeof commandMeta === "object") {
    return String((commandMeta as Record<string, unknown>).topicId || "").trim();
  }
  return "";
}

export function isProcessingLikeText(text: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.includes("正在处理") || normalized.includes("已收到") || normalized.includes("轮询触发");
}

export function isDebugLikeDiscussionText(text: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.includes("当前状态") || normalized.includes("显示情况") || normalized.includes("topicId") || normalized.includes("command_id=") || normalized.includes("commandId") || normalized.includes("participants") || normalized.includes("参与者");
}

export function cleanDiscussionReplyText(text: string) {
  let cleaned = String(text || "").trim();
  const stopMarkers = ["当前状态", "显示情况", "topicId", "command_id=", "commandId", "participants", "参与者"];
  for (const marker of stopMarkers) {
    const index = cleaned.indexOf(marker);
    if (index > 0) cleaned = cleaned.slice(0, index).trim();
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (["阿三已收到。", "零号已收到。", "我已收到。"].includes(cleaned)) {
    return "";
  }
  return cleaned;
}

export function isFinalDiscussionReply(message: { kind?: string; text?: string; meta?: Record<string, unknown> | null | undefined }) {
  const kind = String(message.kind || "").trim().toLowerCase();
  const stage = String((message.meta || {})?.stage || "").trim().toLowerCase();
  const text = String(message.text || "").trim();
  if (!(kind === "result" || stage === "result")) return false;
  if (isProcessingLikeText(text) || isDebugLikeDiscussionText(text)) return false;
  return Boolean(cleanDiscussionReplyText(text));
}

export function normalizeDiscussionStage(rawStage: string, text: string) {
  const normalizedStage = String(rawStage || "result").trim().toLowerCase();
  return normalizedStage === "result" && isProcessingLikeText(text) ? "processing" : normalizedStage;
}

export function discussionParticipantStates(thread: DiscussionThread, outboxMessages: BridgeMessage[], inboxMessages: BridgeMessage[]) {
  return thread.participants.map((participant) => {
    const replied = inboxMessages.some((message) => {
      const meta = (message.meta || null) as Record<string, unknown> | null;
      return extractTopicId(meta) === thread.id && String(message.from || "").trim() === participant && isFinalDiscussionReply({ kind: message.kind, text: message.text, meta });
    });

    const stillPending = outboxMessages.some((message) => {
      const meta = (message.meta || null) as Record<string, unknown> | null;
      return extractTopicId(meta) === thread.id && String(message.to || "").trim() === participant;
    });

    return {
      participant,
      state: replied ? "replied" : stillPending ? "pending" : "pending",
    };
  });
}

export function typingParticipants(thread: DiscussionThread, inboxMessages: BridgeMessage[]) {
  const latestByParticipant = new Map<string, BridgeMessage>();
  for (const message of inboxMessages) {
    const meta = (message.meta || null) as Record<string, unknown> | null;
    if (extractTopicId(meta) !== thread.id) continue;
    const participant = String(message.from || "").trim();
    if (!participant) continue;
    const current = latestByParticipant.get(participant);
    if (!current || Date.parse(message.createdAt) >= Date.parse(current.createdAt)) {
      latestByParticipant.set(participant, message);
    }
  }

  return thread.participants.filter((participant) => {
    const latest = latestByParticipant.get(String(participant || "").trim());
    if (!latest) return false;
    return isProcessingLikeText(latest.text) && !isFinalDiscussionReply({ kind: latest.kind, text: latest.text, meta: latest.meta as Record<string, unknown> | null });
  });
}

export function deriveDiscussionStatus(thread: DiscussionThread, inboxMessages: BridgeMessage[]): DiscussionStatus {
  const repliedCount = thread.participants.filter((participant) => {
    return inboxMessages.some((message) => {
      const meta = (message.meta || null) as Record<string, unknown> | null;
      return extractTopicId(meta) === thread.id && String(message.from || "").trim() === participant && isFinalDiscussionReply({ kind: message.kind, text: message.text, meta });
    });
  }).length;

  if (thread.participants.length > 0 && repliedCount >= thread.participants.length) return "closed";
  if (repliedCount > 0) return "deciding";
  return "open";
}

export function repliedParticipants(thread: DiscussionThread, inboxMessages: BridgeMessage[]) {
  return new Set(
    inboxMessages
      .filter((item) => extractTopicId((item.meta || null) as Record<string, unknown> | null) === thread.id)
      .filter((item) => isFinalDiscussionReply({ kind: item.kind, text: item.text, meta: (item.meta || null) as Record<string, unknown> | null }))
      .map((item) => String(item.from || "").trim())
      .filter(Boolean),
  );
}
