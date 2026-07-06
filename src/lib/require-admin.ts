// Druhá obranná linie autorizace admin API (oprava SEC-2). Proxy vrstva
// (src/proxy.ts) zůstává první kontrolou (redirect stránek + rychlé 401),
// ale handlery se na ni nesmí spoléhat jako na jedinou — chybný matcher po
// budoucí úpravě nebo obejití middleware (historicky CVE-2025-29927) by jinak
// otevřely admin operace nad service-role klientem.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { SESSION_COOKIE_NAME, verifiedSessionIssuedAt } from "@/lib/auth";
import { isSessionRevoked } from "@/lib/session-revocation";

function deny(): NextResponse {
  // Stejná hláška i tvar odpovědi jako v proxy — klient nerozliší, která
  // vrstva požadavek zamítla.
  return NextResponse.json(
    { error: "Nepřihlášen — přihlaste se v administraci." },
    { status: 401 }
  );
}

/**
 * Ověří admin session cookie. Volat na prvním řádku každého admin handleru,
 * před čtením těla i před přístupem k DB.
 *
 * @returns `null` při platné session; jinak hotovou 401 odpověď k vrácení.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return deny();

  const issuedAt = await verifiedSessionIssuedAt(
    cookie.value,
    config.sessionSecret
  );
  if (issuedAt === null) return deny();

  // Revokace po logoutu (SEC-4) — proxy v edge ověří jen podpis+expiraci.
  if (await isSessionRevoked(issuedAt)) return deny();

  return null;
}
