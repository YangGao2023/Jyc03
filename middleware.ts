import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "jyc_owner_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 保护 /dashboard 路径，无 cookie 则跳转登录
  if (pathname.startsWith("/dashboard")) {
    const session = req.cookies.get(SESSION_COOKIE);
    if (!session) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 已登录访问 /login → 跳转到 /dashboard
  if (pathname === "/login") {
    const session = req.cookies.get(SESSION_COOKIE);
    if (session) {
      const dashUrl = req.nextUrl.clone();
      dashUrl.pathname = "/dashboard";
      return NextResponse.redirect(dashUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard", "/login"],
};
