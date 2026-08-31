// Načtení přihlášeného uživatele ze session cookie (etapa A plánu rolí).
// Jediné místo, kde se z cookie stává identita s oprávněními — volají ho
// admin API (requireAppRole) i admin layout (stránky).
//
// Aplikační role se ZÁMĚRNĚ nečte z cookie, ale z DB při každém požadavku:
// odebrání oprávnění tak platí okamžitě a cookie není zdrojem pravdy.
// Cena je jeden select navíc — v requestu, který stejně volá getSettings(),
// zanedbatelná.
import { cookies } from "next/headers";
import { config } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/lib/auth";
import { getSessionsInvalidBefore } from "@/lib/session-revocation";

/** Aplikační role — co uživatel smí dělat (viz kap. 3 plánu rolí). */
export type AppRole = "admin" | "editor" | "viewer";

/** Pořadí pro porovnání „aspoň tato role"; vyšší číslo = víc oprávnění. */
const ROLE_RANK: Record<AppRole, number> = { viewer: 1, editor: 2, admin: 3 };

export function roleAtLeast(role: AppRole, min: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string | null;
  appRole: AppRole;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  app_role: AppRole;
  is_active: boolean;
  sessions_invalid_before: string;
}

/**
 * Vrátí přihlášeného uživatele, nebo `null` když session chybí, je neplatná,
 * revokovaná, nebo účet neexistuje či je deaktivovaný.
 *
 * Revokace se kontroluje na dvou úrovních: per-user
 * (`users.sessions_invalid_before` — logout, reset hesla, deaktivace) a
 * globálně (`auth_state` — ruční kill-switch, migrace 011).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return null;

  const session = await verifySessionCookie(cookie.value, config.sessionSecret);
  if (!session) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, app_role, is_active, sessions_invalid_before")
    .eq("id", session.userId)
    .maybeSingle<UserRow>();

  if (error) {
    // Výpadek DB nesmí vpustit dovnitř — na rozdíl od revokace (fail-open)
    // je tohle samotné ověření identity a musí selhat uzavřeně.
    console.error("Načtení uživatele session selhalo:", error);
    return null;
  }
  if (!data || !data.is_active) return null;

  if (session.issuedAt < new Date(data.sessions_invalid_before).getTime()) {
    return null;
  }
  // Globální kill-switch; fail-open při chybějící tabulce (viz session-revocation).
  if (session.issuedAt < (await getSessionsInvalidBefore())) return null;

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    appRole: data.app_role,
  };
}
