import { NextResponse } from "next/server";
import { parseMessageBody, verifyBridgeRequest } from "@/lib/agent-bridge";
import { makePromiseId, readPromises, upsertPromise } from "@/lib/promise-store";

export async function GET(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const items = await readPromises();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Promise read failed" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { bodyText } = await verifyBridgeRequest(request);
    const body = parseMessageBody(bodyText);
    const title = String(body.title || "").trim();
    const owner = String(body.owner || "").trim();
    if (!title || !owner) {
      return NextResponse.json({ ok: false, error: "Missing title or owner" }, { status: 400 });
    }
    const item = await upsertPromise({
      id: body.id ? String(body.id) : makePromiseId(),
      kind: String(body.kind || "followup"),
      title,
      description: body.description ? String(body.description) : undefined,
      owner,
      backup: body.backup ? String(body.backup) : undefined,
      createdBy: body.createdBy ? String(body.createdBy) : undefined,
      createdAt: body.createdAt ? String(body.createdAt) : new Date().toISOString(),
      dueAt: body.dueAt ? String(body.dueAt) : undefined,
      nextCheckAt: body.nextCheckAt ? String(body.nextCheckAt) : undefined,
      status: String(body.status || "promised") as any,
      blockedReason: body.blockedReason ? String(body.blockedReason) : undefined,
      requiredProof: Array.isArray(body.requiredProof) ? body.requiredProof.map(String) : undefined,
      latestProofSummary: body.latestProofSummary ? String(body.latestProofSummary) : undefined,
      latestProgressAt: body.latestProgressAt ? String(body.latestProgressAt) : undefined,
      relatedTaskId: body.relatedTaskId ? String(body.relatedTaskId) : undefined,
      sourceChannel: body.sourceChannel ? String(body.sourceChannel) : undefined,
      sourceMessageId: body.sourceMessageId ? String(body.sourceMessageId) : undefined,
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Promise write failed" }, { status: 401 });
  }
}
