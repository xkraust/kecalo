import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "./lib/auth";

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const secret = process.env.ADMIN_PASSWORD ?? "";
  const valid = await verifySession(cookie.value, secret);
  if (!valid) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}
