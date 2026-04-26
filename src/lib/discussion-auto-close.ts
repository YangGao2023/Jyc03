import type { BridgeMessage } from "@/lib/agent-bridge";
import { readQueue, writeQueue } from "@/lib/agent-bridge";
import { extractTopicId, isFinalDiscussionReply, repliedParticipants } from "@/lib/discussion-semantics";
import { readDiscussionThread, upsertDiscussionThread } from "@/lib/discussion-store";

export async function maybeAutoCloseDiscussion(message: BridgeMessage) {
  const meta = (message.meta || null) as Record<string, unknown> | null;
  const topicId = extractTopicId(meta);
  if (!topicId || !isFinalDiscussionReply({ kind: message.kind, text: message.text, meta })) {
    return;
  }

  const thread = await readDiscussionThread(topicId);
  if (!thread || thread.status === "closed") {
    return;
  }

  const inbox = await readQueue("inbox");
  const replied = repliedParticipants(thread, inbox);
  const allReplied = thread.participants.every((participant) => replied.has(String(participant || "").trim()));

  if (!allReplied) {
    if (thread.status !== "deciding") {
      await upsertDiscussionThread({
        ...thread,
        status: "deciding",
        summary: `已收到 ${replied.size}/${thread.participants.length} 位参与者回复，等待本轮讨论收齐后自动收口`,
      });
    }
    return;
  }

  const outbox = await readQueue("outbox");
  await writeQueue(
    "outbox",
    outbox.filter((item) => extractTopicId((item.meta || null) as Record<string, unknown> | null) !== topicId),
  );

  await upsertDiscussionThread({
    ...thread,
    status: "closed",
    summary: `本轮讨论已自动收口，${thread.participants.join(" / ")} 均已回复`,
  });
}
