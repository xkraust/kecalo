// Druhá obranná linie autorizace admin API (oprava SEC-2). Proxy vrstva
// (src/proxy.ts) zůstává první kontrolou (redirect stránek + rychlé 401),
// ale handlery se na ni nesmí spoléhat jako na jedinou — chybný matcher po
// budoucí úpravě nebo obejití middleware (historicky CVE-2025-29927) by jinak
// otevřely admin operace nad service-role klientem.
//
// Od etapy A plánu rolí kontroluje i aplikační roli: proxy v edge runtimu
// nemá přístup k DB, takže roli i revokaci může ověřit až tato Node vrstva.
import { NextResponse } from "next/server";
import {
  getSessionUser,
  roleAtLeast,
  type AppRole,
  type SessionUser,
} from "@/lib/session-user";

function unauthenticated(): NextResponse {
  // Stejná hláška i tvar odpovědi jako v proxy — klient nerozliší, která
  // vrstva požadavek zamítla.
  return NextResponse.json(
    { error: "Nepřihlášen — přihlaste se v administraci." },
    { status: 401 }
  );
}

function forbidden(): NextResponse {
  // 403, ne 401: uživatel je přihlášený, jen na tuhle operaci nemá právo.
  // Přihlášení znovu by mu nepomohlo a redirect na login by ho zacyklil.
  return NextResponse.json(
    { error: "K této operaci nemáte oprávnění." },
    { status: 403 }
  );
}

export type RoleCheck =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Ověří session a aplikační roli. Volat na prvním řádku každého admin
 * handleru, před čtením těla i před přístupem k DB.
 *
 * @param min minimální požadovaná role (`viewer` < `editor` < `admin`)
 * @returns `{ ok: true, user }` při dostatečném oprávnění, jinak hotovou
 *          odpověď 401/403 k vrácení.
 */
export async function requireAppRole(min: AppRole): Promise<RoleCheck> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: unauthenticated() };
  if (!roleAtLeast(user.appRole, min)) {
    return { ok: false, response: forbidden() };
  }
  return { ok: true, user };
}
