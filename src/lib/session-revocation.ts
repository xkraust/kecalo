// Server-side revokace admin session (oprava SEC-4). Logout jen mazal cookie —
// podepsaný token platil do expirace (8 h) a odcizená cookie fungovala i po
// odhlášení. Řešení pro jediný admin účet: jednořádková tabulka auth_state
// (migrace 011) s časovým razítkem sessions_invalid_before. Logout ho posune na
// now(); token vydaný dřív se odmítne. Kontrola běží v Node runtimu (requireAdmin
// pro admin API, admin layout pro stránky) — proxy v edge zůstává rychlým
// podpisovým gatem. Service-role klient (RLS obchází).
import { supabase } from "@/lib/supabase";

/** Časové razítko (ms), před nímž jsou všechny tokeny neplatné. Při chybějící
 * tabulce / chybě DB vrací 0 (fail-open) — revokace se neuplatní, ale podpis a
 * expirace se ověřují dál. Umožňuje nasadit kód před aplikací migrace 011. */
export async function getSessionsInvalidBefore(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("auth_state")
      .select("sessions_invalid_before")
      .eq("id", 1)
      .single<{ sessions_invalid_before: string }>();
    if (error || !data) return 0;
    return new Date(data.sessions_invalid_before).getTime();
  } catch {
    return 0;
  }
}

/** Zneplatní všechny existující session (nastaví hranici na now()). Volá logout.
 * Best-effort: chybu jen zaloguje, aby logout nikdy neselhal (cookie se maže tak
 * jako tak). */
export async function revokeAllSessions(): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("auth_state")
    .update({ sessions_invalid_before: now, updated_at: now })
    .eq("id", 1);
  if (error) console.error("Revokace session selhala:", error);
}

/** Byl token vydaný v čase `issuedAtMs` zneplatněn pozdějším logoutem? */
export async function isSessionRevoked(issuedAtMs: number): Promise<boolean> {
  return issuedAtMs < (await getSessionsInvalidBefore());
}
