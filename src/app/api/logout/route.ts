import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "jyc_owner_session";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/login",
    },
  });
}
