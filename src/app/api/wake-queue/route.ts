import { NextResponse } from "next/server";
import { parseMessageBody, verifyBridgeRequest } from "@/lib/agent-bridge";
import { appendWakeItem, makeWakeId, readWakeQueue } from "@/lib/wake-store";

export async function GET(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const url = new URL(request.url);
    const targetAgent = (url.searchParams.get("agent") || "").trim();
    const items = await readWakeQueue();
    const filtered = targetAgent ? items.filter((item) => item.targetAgent === targetAgent) : items;
    return NextResponse.json({ ok: true, items: filtered });
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
