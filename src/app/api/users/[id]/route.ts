// Úprava uživatele (etapa B plánu rolí): role, aktivace, reset hesla.
// Uživatelé se nemažou, jen deaktivují — drží to integritu budoucího
// navázání leads.assignee a auditní stopu.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAppRole } from "@/lib/require-role";
import { generatePassword, hashPassword } from "@/lib/password";
import { revokeUserSessions } from "@/lib/session-revocation";
import type { AppRole } from "@/lib/session-user";

const APP_ROLES: AppRole[] = ["admin", "editor", "viewer"];

interface TargetRow {
  id: string;
  app_role: AppRole;
  is_active: boolean;
  auth_provider: string;
}

/**
 * Zbyl by po této změně aspoň jeden aktivní admin? (invariant 11)
 * Bez pojistky si organizace jedním kliknutím zamkne správu systému a
 * odemykal by ji jen zásah do DB.
 */
async function wouldRemoveLastAdmin(
  target: TargetRow,
  nextRole: AppRole,
  nextActive: boolean
): Promise<boolean> {
  const staysAdmin = nextRole === "admin" && nextActive;
  if (target.app_role !== "admin" || !target.is_active || staysAdmin) {
    return false;
  }
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("app_role", "admin")
    .eq("is_active", true);
  if (error) {
    // Nejde-li ověřit, raději operaci nepustit než riskovat zamčení.
    console.error("Kontrola počtu adminů selhala:", error);
    return true;
  }
  return (count ?? 0) <= 1;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  const { appRole, isActive, resetPassword } = body as {
    appRole?: unknown;
    isActive?: unknown;
    resetPassword?: unknown;
  };

  if (appRole !== undefined && (typeof appRole !== "string" || !APP_ROLES.includes(appRole as AppRole))) {
    return NextResponse.json({ error: "Neplatná aplikační role." }, { status: 400 });
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return NextResponse.json({ error: "Neplatná hodnota stavu." }, { status: 400 });
  }

  // Vlastní roli ani vlastní aktivaci si admin měnit nesmí. Změna role
  // revokuje session (invariant 10), takže degradace sebe sama vypadá jako
  // náhlé vypadnutí z administrace — a při jediném adminovi by systém
  // zamkla úplně. Reset vlastního hesla je naopak legitimní a povolený.
  if (id === auth.user.id && (appRole !== undefined || isActive !== undefined)) {
    return NextResponse.json(
      {
        error:
          "Vlastní roli ani vlastní přístup měnit nelze — požádejte jiného admina.",
      },
      { status: 409 }
    );
  }

  const { data: target, error: findErr } = await supabase
    .from("users")
    .select("id, app_role, is_active, auth_provider")
    .eq("id", id)
    .maybeSingle<TargetRow>();

  if (findErr) {
    console.error("Načtení uživatele selhalo:", findErr);
    return NextResponse.json({ error: "Operace se nezdařila." }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "Uživatel neexistuje." }, { status: 404 });
  }

  const nextRole = (appRole as AppRole | undefined) ?? target.app_role;
  const nextActive = (isActive as boolean | undefined) ?? target.is_active;

  if (await wouldRemoveLastAdmin(target, nextRole, nextActive)) {
    return NextResponse.json(
      {
        error:
          "Tohle je poslední aktivní admin — nejdřív povyšte jiného uživatele na admina.",
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };
  let newPassword: string | null = null;

  if (appRole !== undefined) update.app_role = nextRole;
  if (isActive !== undefined) update.is_active = nextActive;

  if (resetPassword === true) {
    // SSO účet heslo nemá a mít nesmí (invariant 8) — reset by mu vytvořil
    // cestu okolo IdP, tedy okolo MFA i deaktivace po odchodu ze zaměstnání.
    if (target.auth_provider !== "local") {
      return NextResponse.json(
        { error: "Účet přihlašovaný přes SSO nemá heslo, které by šlo resetovat." },
        { status: 400 }
      );
    }
    newPassword = generatePassword();
    update.password_hash = await hashPassword(newPassword);
    update.must_change_password = true;
  }

  const { error: updErr } = await supabase.from("users").update(update).eq("id", id);
  if (updErr) {
    console.error("Úprava uživatele selhala:", updErr);
    return NextResponse.json({ error: "Uložení se nezdařilo." }, { status: 500 });
  }

  // Změna role, deaktivace i reset hesla musí ukončit běžící session
  // dotčeného (invariant 10) — jinak by dojezdila se starými oprávněními.
  if (appRole !== undefined || isActive !== undefined || newPassword) {
    await revokeUserSessions(id);
  }

  return NextResponse.json({ ok: true, ...(newPassword ? { password: newPassword } : {}) });
}
