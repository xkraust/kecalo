import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "./lib/auth";

// Chráněné jsou admin stránky a admin API routy. Veřejné zůstávají:
// /api/chat, /api/feedback a /api/auth/* (login/logout).
export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/documents",
    "/api/documents/:path*",
    "/api/settings",
    "/api/retrieval-test",
  ],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Pro API routy nemá redirect na login smysl — vracíme 401 JSON.
  const deny = () =>
    pathname.startsWith("/api/")
      ? NextResponse.json(
          { error: "Nepřihlášen — přihlaste se v administraci." },
          { status: 401 }
        )
      : NextResponse.redirect(new URL("/admin/login", request.url));

  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) {
    return deny();
  }

  // Chybějící secret = zamítnout přístup, nikdy neověřovat proti prázdnému klíči.
  // (Proxy neimportuje lib/config — běží v edge runtime a config vyžaduje
  // všechny env proměnné najednou.)
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error("SESSION_SECRET není nastaven — admin je nedostupný.");
    return deny();
  }

  const valid = await verifySession(cookie.value, secret);
  if (!valid) {
    return deny();
  }

  return NextResponse.next();
}
