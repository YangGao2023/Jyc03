import { NextResponse } from "next/server";
import { verifyBridgeRequest } from "@/lib/agent-bridge";
import { computeWatchdogAlerts, runWatchdogActions } from "@/lib/watchdog";

export async function GET(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const alerts = await computeWatchdogAlerts();
    return NextResponse.json({ ok: true, alerts });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Watchdog read failed" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const result = await runWatchdogActions();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Watchdog run failed" }, { status: 401 });
  }
}
