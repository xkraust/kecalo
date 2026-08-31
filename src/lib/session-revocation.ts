// Server-side revokace admin session (oprava SEC-4). Logout jen mazal cookie —
// podepsaný token platil do expirace (8 h) a odcizená cookie fungovala i po
// odhlášení. Kontrola běží v Node runtimu (requireAppRole pro admin API, admin
// layout pro stránky) — proxy v edge zůstává rychlým podpisovým gatem.
// Service-role klient (RLS obchází).
//
// Dvě úrovně (etapa A plánu rolí):
//   - per-user `users.sessions_invalid_before` — běžná cesta: logout, reset
//     hesla, deaktivace účtu. Odhlásí jen dotčeného uživatele.
//   - globální `auth_state` (migrace 011) — od zavedení tabulky users už jen
//     RUČNÍ kill-switch pro incident. Volat ho z logoutu by znamenalo, že
//     kterýkoli uživatel odhlásí všechny ostatní.
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

/** Zneplatní session VŠECH uživatelů (ruční kill-switch pro incident).
 * Nevolat z logoutu — odhlásilo by to celou organizaci. Best-effort: chybu jen
 * zaloguje. */
export async function revokeAllSessions(): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("auth_state")
    .update({ sessions_invalid_before: now, updated_at: now })
    .eq("id", 1);
  if (error) console.error("Globální revokace session selhala:", error);
}

/**
 * Zneplatní session jednoho uživatele (logout, reset hesla, deaktivace, změna
 * rolí). Best-effort: chybu jen zaloguje, aby logout nikdy neselhal — cookie se
 * maže tak jako tak.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("users")
    .update({ sessions_invalid_before: now, updated_at: now })
    .eq("id", userId);
  if (error) console.error("Revokace session uživatele selhala:", error);
}
