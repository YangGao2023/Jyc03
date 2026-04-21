import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: "jyc-agent-bridge",
    endpoints: ["/api/inbox", "/api/outbox"],
    auth: "HMAC + timestamp + nonce",
    storage: "Vercel KV / Redis",
  });
}
