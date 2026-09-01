// JIT provisioning SSO uživatele (etapa D plánu rolí).
//
// SSO uživatel má v Kecalu vlastní řádek v `users`, ale nezakládá ho nikdo
// ručně — vzniká při prvním přihlášení. Lokální řádek musí existovat proto, že
// IdP neví nic o aplikačních ani pracovních rolích: ty potřebují cizí klíč, na
// který se navěsí `user_job_roles`, a stejné `user_id` využívá per-user
// revokace session i budoucí navázání `leads.assignee`.
import { supabase } from "@/lib/supabase";
import { revokeUserSessions } from "@/lib/session-revocation";
import type { IdpClaims } from "@/lib/auth/oidc";

export type ProvisionResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  is_active: boolean;
  auth_provider: string;
}

/**
 * Přeloží skupiny z claims na kódy pracovních rolí přes `job_roles.external_group`.
 * Skupina bez namapované role se tiše ignoruje — IdP jich obvykle posílá spoustu
 * a nemapované nejsou chyba.
 */
async function rolesForGroups(groups: string[]): Promise<string[]> {
  if (groups.length === 0) return [];
  const { data, error } = await supabase
    .from("job_roles")
    .select("code, external_group")
    .in("external_group", groups);
  if (error) {
    console.error("Mapování skupin na pracovní role selhalo:", error);
    return [];
  }
  return (data ?? []).map((r) => r.code as string);
}

/**
 * Přepíše pracovní role uživatele podle claims. **IdP je zdroj pravdy** —
 * přeložení člověka mezi odděleními se propíše samo a opuštěná oprávnění
 * nepřežijí. Vrací `true`, když se sada rolí opravdu změnila.
 */
async function syncJobRoles(
  userId: string,
  desired: string[]
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_job_roles")
    .select("job_role_code")
    .eq("user_id", userId);
  if (error) {
    console.error("Načtení pracovních rolí selhalo:", error);
    return false;
  }

  const current = new Set((data ?? []).map((r) => r.job_role_code as string));
  const next = new Set(desired);
  const same =
    current.size === next.size && [...current].every((c) => next.has(c));
  if (same) return false;

  const { error: delErr } = await supabase
    .from("user_job_roles")
    .delete()
    .eq("user_id", userId);
  if (delErr) {
    console.error("Úklid pracovních rolí selhal:", delErr);
    return false;
  }
  if (desired.length > 0) {
    const { error: insErr } = await supabase
      .from("user_job_roles")
      .insert(desired.map((code) => ({ user_id: userId, job_role_code: code })));
    if (insErr) console.error("Vložení pracovních rolí selhalo:", insErr);
  }
  return true;
}

/**
 * Najde nebo založí uživatele podle ověřených claims a srovná jeho pracovní
 * role se skupinami z IdP.
 *
 * Aplikační role se z IdP **záměrně nemapuje**: nový uživatel je vždy `viewer`
 * (DEFAULT ve schématu) a povýšit ho musí admin v Kecalu. Chybná konfigurace
 * skupin tak nikoho neudělá adminem a správa systému nezávisí na tom, kdo smí
 * zakládat skupiny v IdP.
 */
export async function provisionSsoUser(
  claims: IdpClaims
): Promise<ProvisionResult> {
  // Párování výhradně přes (iss, sub) — viz komentář v oidc.ts.
  const { data: existing, error: findErr } = await supabase
    .from("users")
    .select("id, username, display_name, is_active, auth_provider")
    .eq("external_issuer", claims.issuer)
    .eq("external_subject", claims.subject)
    .maybeSingle<UserRow>();

  if (findErr) {
    console.error("Vyhledání SSO uživatele selhalo:", findErr);
    return { ok: false, error: "Přihlášení se nezdařilo. Zkuste to prosím za chvíli." };
  }

  const desiredRoles = await rolesForGroups(claims.groups);
  // `username` je jen zobrazované jméno účtu; identita stojí na (iss, sub).
  const username = claims.email ?? `${claims.subject}@${new URL(claims.issuer).host}`;

  if (existing) {
    if (!existing.is_active) {
      return { ok: false, error: "Účet je deaktivovaný. Obraťte se na správce." };
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (claims.name && claims.name !== existing.display_name) {
      patch.display_name = claims.name;
    }
    // Změna e-mailu v IdP se propíše; kolize s cizím účtem se ignoruje
    // (unique violation), aby přejmenování nezablokovalo přihlášení.
    if (username !== existing.username) patch.username = username;

    const { error: updErr } = await supabase
      .from("users")
      .update(patch)
      .eq("id", existing.id);
    if (updErr && updErr.code !== "23505") {
      console.error("Aktualizace SSO uživatele selhala:", updErr);
    }

    const changed = await syncJobRoles(existing.id, desiredRoles);
    // Změna oprávnění musí ukončit ostatní běžící session (invariant 10);
    // aktuální přihlášení dostane novou cookie hned po návratu.
    if (changed) await revokeUserSessions(existing.id);

    return { ok: true, userId: existing.id };
  }

  const { data: created, error: insErr } = await supabase
    .from("users")
    .insert({
      username,
      display_name: claims.name ?? username,
      // app_role se nenastavuje — platí DEFAULT 'viewer' ze schématu.
      auth_provider: "oidc",
      external_issuer: claims.issuer,
      external_subject: claims.subject,
    })
    .select("id")
    .single<{ id: string }>();

  if (insErr || !created) {
    if (insErr?.code === "23505") {
      // Lokální účet se stejným jménem — tiché přejmenování by bylo horší než
      // srozumitelná chyba, protože by správce nepoznal, co se stalo.
      return {
        ok: false,
        error: `Uživatelské jméno „${username}" už v Kecalu existuje jako lokální účet. Požádejte správce o jeho přejmenování.`,
      };
    }
    console.error("Založení SSO uživatele selhalo:", insErr);
    return { ok: false, error: "Založení účtu se nezdařilo." };
  }

  await syncJobRoles(created.id, desiredRoles);
  return { ok: true, userId: created.id };
}
