import { NextResponse } from "next/server";
import { parseMessageBody, verifyBridgeRequest } from "@/lib/agent-bridge";
import { readAgentStatuses, upsertAgentStatus } from "@/lib/agent-status";

export async function GET(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const statuses = await readAgentStatuses();
    return NextResponse.json({ ok: true, statuses });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Agent status read failed" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { bodyText } = await verifyBridgeRequest(request);
    const body = parseMessageBody(bodyText);
    const agent = String(body.agent || "").trim();
    if (!agent) {
      return NextResponse.json({ ok: false, error: "Missing agent" }, { status: 400 });
    }

    const status = await upsertAgentStatus({
      agent,
      role: body.role ? String(body.role) : undefined,
      status: String(body.status || "standby"),
      summary: body.summary ? String(body.summary) : undefined,
      owner: body.owner ? String(body.owner) : undefined,
      backup: body.backup ? String(body.backup) : undefined,
      taskId: body.taskId ? String(body.taskId) : undefined,
      source: body.source ? String(body.source) : undefined,
    });

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Agent status write failed" }, { status: 401 });
  }
}
