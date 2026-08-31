// Změna vlastního hesla přihlášeným uživatelem (etapa B plánu rolí).
// Nepoužívá requireAppRole: tahle routa musí projít i účtu s příznakem
// must_change_password, který je jinde blokovaný.
//
// „Zapomenuté heslo" bez přihlášení tu záměrně není — aplikace nemá e-mailový
// kanál pro obnovu, takže ho řeší admin resetem.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { getSessionUser } from "@/lib/session-user";
import { revokeUserSessions } from "@/lib/session-revocation";
import {
  hashPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/password";
import {
  createSessionCookie,
  SESSION_COOKIE_NAME,
  COOKIE_OPTIONS,
} from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Nepřihlášen — přihlaste se v administraci." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const currentPassword = (body as { currentPassword?: unknown } | null)
    ?.currentPassword;
  const newPassword = (body as { newPassword?: unknown } | null)?.newPassword;

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return NextResponse.json(
      { error: "Vyplňte stávající i nové heslo." },
      { status: 400 }
    );
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Nové heslo musí mít aspoň ${MIN_PASSWORD_LENGTH} znaků.` },
      { status: 400 }
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "Nové heslo se musí lišit od stávajícího." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("users")
    .select("password_hash, auth_provider")
    .eq("id", user.id)
    .maybeSingle<{ password_hash: string | null; auth_provider: string }>();

  if (error || !data) {
    console.error("Načtení hesla selhalo:", error);
    return NextResponse.json({ error: "Operace se nezdařila." }, { status: 500 });
  }
  // SSO účet heslo nemá — mít ho by znamenalo cestu okolo IdP (invariant 8).
  if (data.auth_provider !== "local" || !data.password_hash) {
    return NextResponse.json(
      { error: "Účet přihlašovaný přes SSO heslo nepoužívá." },
      { status: 400 }
    );
  }
  if (!(await verifyPassword(currentPassword, data.password_hash))) {
    return NextResponse.json(
      { error: "Stávající heslo nesouhlasí." },
      { status: 401 }
    );
  }

  const { error: updErr } = await supabase
    .from("users")
    .update({
      password_hash: await hashPassword(newPassword),
      must_change_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updErr) {
    console.error("Změna hesla selhala:", updErr);
    return NextResponse.json({ error: "Uložení se nezdařilo." }, { status: 500 });
  }

  // Odhlásit všechny session včetně této — ukradená session s iniciálním
  // heslem tím padá. Vzápětí vydáme novou cookie, aby uživatel nepřišel
  // o právě probíhající práci.
  await revokeUserSessions(user.id);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    SESSION_COOKIE_NAME,
    await createSessionCookie(config.sessionSecret, user.id),
    COOKIE_OPTIONS
  );
  return res;
}
