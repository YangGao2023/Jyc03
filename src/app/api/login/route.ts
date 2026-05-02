import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "jyc_owner_session";
const VALID_USERNAME = "JYCSTEEL";
const VALID_PASSWORD = "Ding123qwe.";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const next = String(formData.get("next") || "/dashboard").trim() || "/dashboard";

  const validUser = username === VALID_USERNAME;
  const validPassword = password === VALID_PASSWORD;

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
    maxAge: 60 * 60 * 24 * 7,
  });

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: next.startsWith("/") ? next : "/dashboard",
    },
  });
}
