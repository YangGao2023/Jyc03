import { NextResponse } from "next/server";
import { parseMessageBody, verifyBridgeRequest } from "@/lib/agent-bridge";
import { readAgentStatusHistory, readAgentStatuses, upsertAgentStatus } from "@/lib/agent-status";

export async function GET(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const statuses = await readAgentStatuses();
    const history = await readAgentStatusHistory({ hours: 24, limitPerAgent: 288 });
    return NextResponse.json({ ok: true, statuses, history });
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
      status: String(body.status || body.system_state || "standby"),
      summary: body.summary ? String(body.summary) : undefined,
      owner: body.owner ? String(body.owner) : undefined,
      backup: body.backup ? String(body.backup) : undefined,
      taskId: body.taskId ? String(body.taskId) : body.task_id ? String(body.task_id) : undefined,
      source: body.source ? String(body.source) : undefined,
      systemState: body.systemState ? String(body.systemState) : body.system_state ? String(body.system_state) : undefined,
      taskProgress: body.taskProgress ? String(body.taskProgress) : body.task_progress ? String(body.task_progress) : undefined,
      currentTask: body.currentTask ? String(body.currentTask) : body.current_task ? String(body.current_task) : undefined,
      realCtxUsage: typeof body.realCtxUsage === "number" ? body.realCtxUsage : typeof body.real_ctx_usage === "number" ? body.real_ctx_usage : body.realCtxUsage != null ? Number(body.realCtxUsage) : body.real_ctx_usage != null ? Number(body.real_ctx_usage) : undefined,
      lastHeartbeat: body.lastHeartbeat ? String(body.lastHeartbeat) : body.last_heartbeat ? String(body.last_heartbeat) : undefined,
      typingSince: body.typingSince ? String(body.typingSince) : body.typing_since ? String(body.typing_since) : undefined,
      errorDetail: body.errorDetail ? String(body.errorDetail) : body.error_detail ? String(body.error_detail) : undefined,
      modelName: body.modelName ? String(body.modelName) : body.model_name ? String(body.model_name) : undefined,
      ctxUsed: typeof body.ctxUsed === "number" ? body.ctxUsed : typeof body.ctx_used === "number" ? body.ctx_used : body.ctxUsed != null ? Number(body.ctxUsed) : body.ctx_used != null ? Number(body.ctx_used) : undefined,
      ctxTotal: typeof body.ctxTotal === "number" ? body.ctxTotal : typeof body.ctx_total === "number" ? body.ctx_total : body.ctxTotal != null ? Number(body.ctxTotal) : body.ctx_total != null ? Number(body.ctx_total) : undefined,
      tokenThisRound: typeof body.tokenThisRound === "number" ? body.tokenThisRound : typeof body.token_this_round === "number" ? body.token_this_round : body.tokenThisRound != null ? Number(body.tokenThisRound) : body.token_this_round != null ? Number(body.token_this_round) : undefined,
    });

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Agent status write failed" }, { status: 401 });
  }
}
