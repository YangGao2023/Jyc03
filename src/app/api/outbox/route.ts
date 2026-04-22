import { NextResponse } from "next/server";
import { consumeQueue, enqueueMessage, parseMessageBody, verifyBridgeRequest } from "@/lib/agent-bridge";

export async function GET(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 20)));
    const consume = url.searchParams.get("consume") === "1";
    const recipient = url.searchParams.get("to") || url.searchParams.get("recipient") || undefined;
    const messages = await consumeQueue("outbox", { limit, consume, recipient });
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Bridge read failed" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { bodyText } = await verifyBridgeRequest(request);
    const body = parseMessageBody(bodyText);
    const text = String(body.text || "").trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "Missing text" }, { status: 400 });
    }

    const message = await enqueueMessage("outbox", {
      from: String(body.from || "zero"),
      to: String(body.to || "asan"),
      text,
      kind: String(body.kind || "text"),
      meta: typeof body.meta === "object" && body.meta ? (body.meta as Record<string, unknown>) : undefined,
    });

    return NextResponse.json({ ok: true, message });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Bridge write failed" }, { status: 401 });
  }
}
