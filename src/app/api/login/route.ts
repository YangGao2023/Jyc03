import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "jyc_owner_session";
const DEMO_PASSWORD = "jyc-owner-demo";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const next = String(formData.get("next") || "/dashboard").trim() || "/dashboard";

  const expectedPassword = process.env.OWNER_PANEL_PASSWORD || DEMO_PASSWORD;
  const validUser = username.length > 0;
  const validPassword = password === expectedPassword;

  if (!validUser || !validPassword) {
    const params = new URLSearchParams({ error: "1" });
    if (next.startsWith("/")) {
      params.set("next", next);
    }
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: `/login?${params.toString()}`,
      },
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "ok", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: next.startsWith("/") ? next : "/dashboard",
    },
  });
}
