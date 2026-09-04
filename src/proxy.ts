import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "./lib/auth";

// Chráněné jsou admin stránky a admin API routy. Veřejné zůstávají:
// /api/chat, /api/feedback, /api/auth/* (login/logout/oidc) a POST /api/leads.
// Pozn.: /api/auth/oidc/* v matcheru záměrně NENÍ — je to přihlašovací tok,
// takže vyžadovat pro něj session by ho zacyklilo.
export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/documents",
    "/api/documents/:path*",
    "/api/leads",
    "/api/leads/:path*",
    "/api/settings",
    "/api/retrieval-test",
    "/api/users",
    "/api/users/:path*",
    "/api/job-roles",
    "/api/job-roles/:path*",
    "/api/audiences",
    "/api/audiences/:path*",
    // GDPR etapa B/C. /api/cron/* zde ZÁMĚRNĚ není: cron nemá session cookie,
    // chrání se vlastním secretem (viz api/cron/retention/route.ts).
    "/api/privacy",
    "/api/privacy/:path*",
  ],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Odeslání poptávky z chatu je veřejné; zbytek /api/leads* (PATCH) je admin.
  if (pathname === "/api/leads" && request.method === "POST") {
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
