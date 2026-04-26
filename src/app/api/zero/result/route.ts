import { NextResponse } from "next/server";
import { enqueueMessage, parseMessageBody, verifyBridgeRequest } from "@/lib/agent-bridge";
import { maybeAutoCloseDiscussion } from "@/lib/discussion-auto-close";
import { normalizeDiscussionStage } from "@/lib/discussion-semantics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const { bodyText } = await verifyBridgeRequest(request);
    const body = parseMessageBody(bodyText);
    const commandId = String(body.commandId || body.id || "").trim();
    const text = String(body.result || body.text || "").trim();
    if (!commandId) {
      return NextResponse.json({ ok: false, error: "Missing commandId" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ ok: false, error: "Missing result text" }, { status: 400 });
    }

    const rawStage = String(body.stage || "result");
    const effectiveStage = normalizeDiscussionStage(rawStage, text);
    const effectiveKind = String(effectiveStage).trim().toLowerCase() === "result" ? "result" : "receipt";
    const message = await enqueueMessage("inbox", {
      from: String(body.from || "零号"),
      to: String(body.to || "YANG"),
      kind: effectiveKind,
      text,
      meta: {
        source: "zero-direct-write",
        commandId,
        commandKind: String(body.commandKind || "command"),
        stage: effectiveStage,
        via: "zero-direct-api",
        ...(typeof body.meta === "object" && body.meta ? (body.meta as Record<string, unknown>) : {}),
      },
    });

    await maybeAutoCloseDiscussion(message);

    return NextResponse.json({ ok: true, message });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Zero direct write failed" },
      { status: 401 },
    );
  }
}
