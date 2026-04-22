import { NextResponse } from "next/server";
import { parseMessageBody, verifyBridgeRequest } from "@/lib/agent-bridge";
import { appendProof, makeProofId, readProofs } from "@/lib/proof-store";

export async function GET(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const items = await readProofs();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Proof read failed" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { bodyText } = await verifyBridgeRequest(request);
    const body = parseMessageBody(bodyText);
    const promiseId = String(body.promiseId || "").trim();
    const proofType = String(body.proofType || "").trim();
    if (!promiseId || !proofType) {
      return NextResponse.json({ ok: false, error: "Missing promiseId or proofType" }, { status: 400 });
    }
    const item = await appendProof({
      id: body.id ? String(body.id) : makeProofId(),
      promiseId,
      proofType,
      proofValue: body.proofValue ? String(body.proofValue) : undefined,
      proofPath: body.proofPath ? String(body.proofPath) : undefined,
      createdAt: body.createdAt ? String(body.createdAt) : new Date().toISOString(),
      createdBy: body.createdBy ? String(body.createdBy) : undefined,
      summary: body.summary ? String(body.summary) : undefined,
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Proof write failed" }, { status: 401 });
  }
}
