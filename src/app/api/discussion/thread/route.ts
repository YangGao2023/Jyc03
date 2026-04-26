import { NextResponse } from "next/server";
import { readDiscussionThread } from "@/lib/discussion-store";
import { verifyBridgeRequest } from "@/lib/agent-bridge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await verifyBridgeRequest(request);
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }
    const thread = await readDiscussionThread(id);
    return NextResponse.json({ ok: true, thread });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Discussion thread read failed" },
      { status: 401 },
    );
  }
}
