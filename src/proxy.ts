import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "./lib/auth";

// Chráněné jsou admin stránky a admin API routy. Chat, hodnocení, odeslání
// poptávky a obě chatové stránky jsou veřejné JEN při PUBLIC_CHAT=true;
// bez něj se chovají jako admin routy (etapa G plánu GDPR).
//
// Pozn.: /api/auth/oidc/* v matcheru záměrně NENÍ — je to přihlašovací tok,
// takže vyžadovat pro něj session by ho zacyklilo.
//
// POZOR: `config.matcher` je build-time konstanta — nejde ji podmínit env
// proměnnou. Chatové cesty jsou proto v matcheru VŽDY a o propuštění rozhoduje
// až runtime kód v `proxy()` níže.
export const config = {
  matcher: [
    "/",
    "/demo",
    "/api/chat",
    "/api/feedback",
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

/** Cesty, které jsou veřejné jen ve veřejném režimu (PUBLIC_CHAT=true). */
const PUBLIC_CHAT_PATHS = new Set(["/", "/demo", "/api/chat", "/api/feedback"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Proxy neimportuje lib/config — běží v edge runtime a config vyžaduje
  // všechny env proměnné najednou. Proto se čte přímo z process.env.
  const publicChat = process.env.PUBLIC_CHAT === "true";

  if (publicChat) {
    // Veřejný režim: chat, hodnocení i odeslání poptávky jsou bez přihlášení.
    if (PUBLIC_CHAT_PATHS.has(pathname)) {
      return NextResponse.next();
    }
    if (pathname === "/api/leads" && request.method === "POST") {
      return NextResponse.next();
    }
  }
  // Interní režim: nic z toho výjimku nemá a propadne ke kontrole session
  // níže. Zbytek /api/leads* (zejména PATCH) je admin v obou režimech.

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
