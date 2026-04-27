import { NextResponse } from "next/server";
import { parseMessageBody, verifyBridgeRequest } from "@/lib/agent-bridge";
import { appendWakeItem, consumeWakeQueue, makeWakeId, readWakeQueue } from "@/lib/wake-store";

function parseLimit(raw: string | null, fallback = 20) {
  const parsed = Number(raw ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const url = new URL(request.url);
    const targetAgent = (url.searchParams.get("agent") || "").trim();
    const consume = ["1", "true", "yes"].includes((url.searchParams.get("consume") || "").trim().toLowerCase());
    const includeConsumed = ["1", "true", "yes"].includes((url.searchParams.get("includeConsumed") || "").trim().toLowerCase());
    const limit = parseLimit(url.searchParams.get("limit"), 20);
    const items = consume
      ? await consumeWakeQueue(targetAgent || undefined, limit)
      : await readWakeQueue({ targetAgent: targetAgent || undefined, includeConsumed, limit });
    return NextResponse.json({ ok: true, items, consume, includeConsumed });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Wake queue read failed" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { bodyText } = await verifyBridgeRequest(request);
    const body = parseMessageBody(bodyText);
    const targetAgent = String(body.targetAgent || "").trim();
    const kind = String(body.kind || "").trim();
    if (!targetAgent || !kind) {
      return NextResponse.json({ ok: false, error: "Missing targetAgent or kind" }, { status: 400 });
    }
    const item = await appendWakeItem({
      id: body.id ? String(body.id) : makeWakeId(),
      targetAgent,
      kind,
      relatedId: body.relatedId ? String(body.relatedId) : undefined,
      priority: body.priority ? String(body.priority) : undefined,
      createdAt: body.createdAt ? String(body.createdAt) : new Date().toISOString(),
      consumedAt: body.consumedAt ? String(body.consumedAt) : undefined,
      consumeResult: body.consumeResult ? String(body.consumeResult) : undefined,
      note: body.note ? String(body.note) : undefined,
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Wake queue write failed" }, { status: 401 });
  }
}
