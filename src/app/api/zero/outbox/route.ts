import { NextResponse } from "next/server";
import { consumeQueue, verifyBridgeRequest } from "@/lib/agent-bridge";
import { readDiscussionThread } from "@/lib/discussion-store";
import { parseLimit } from "@/lib/fs-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"), 20);
    const consume = url.searchParams.get("consume") === "1";
    const recipient = String(url.searchParams.get("to") || "零号").trim() || "零号";
    const kind = String(url.searchParams.get("kind") || "").trim().toLowerCase();

    let messages = await consumeQueue("outbox", { limit: Math.max(limit, 50), consume, recipient });
    if (kind) {
      messages = messages.filter((message) => String(message.kind || "").trim().toLowerCase() === kind);
    }

    const topicStatus = Object.fromEntries(
      await Promise.all(
        [...new Set(
          messages
            .map((message) => String((message.meta as Record<string, unknown> | undefined)?.topicId || "").trim())
            .filter(Boolean),
        )].map(async (topicId) => {
          const thread = await readDiscussionThread(topicId);
          return [topicId, String(thread?.status || "open")] as const;
        }),
      ),
    );

    const decorated = messages.slice(0, limit).map((message) => {
      const meta = typeof message.meta === "object" && message.meta ? { ...message.meta } : {};
      const topicId = String((meta as Record<string, unknown>).topicId || "").trim();
      if (topicId && topicStatus[topicId]) {
        (meta as Record<string, unknown>).topicStatus = topicStatus[topicId];
      }
      return { ...message, meta };
    });

    return NextResponse.json({ ok: true, messages: decorated });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Zero outbox read failed" },
      { status: 401 },
    );
  }
}
