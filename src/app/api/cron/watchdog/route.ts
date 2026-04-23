import { NextResponse } from "next/server";
import { runWatchdogActions } from "@/lib/watchdog";

function cronSecret() {
  return process.env.WATCHDOG_CRON_SECRET || process.env.CRON_SECRET || "";
}

export async function GET(request: Request) {
  try {
    const secret = cronSecret();
    if (!secret) {
      return NextResponse.json({ ok: false, error: "Missing cron secret" }, { status: 500 });
    }

    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized cron trigger" }, { status: 401 });
    }

    const result = await runWatchdogActions();
    return NextResponse.json({ ok: true, source: "cron", ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Cron watchdog failed" }, { status: 500 });
  }
}
