// Správa uživatelů (etapa B plánu rolí). Jen pro aplikační roli `admin`.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAppRole } from "@/lib/require-role";
import { generatePassword, hashPassword } from "@/lib/password";
import type { AppRole } from "@/lib/session-user";

const APP_ROLES: AppRole[] = ["admin", "editor", "viewer"];
const MAX_USERNAME = 120;

export async function GET() {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from("users")
    .select(
      "id, username, display_name, app_role, auth_provider, is_active, must_change_password, created_at"
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Načtení uživatelů selhalo:", error);
    return NextResponse.json(
      { error: "Načtení uživatelů se nezdařilo." },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  const { username, displayName, appRole } = body as {
    username?: unknown;
    displayName?: unknown;
    appRole?: unknown;
  };

  if (typeof username !== "string" || username.trim().length < 2) {
    return NextResponse.json(
      { error: "Uživatelské jméno musí mít aspoň 2 znaky." },
      { status: 400 }
    );
  }
  const name = username.trim();
  if (name.length > MAX_USERNAME) {
    return NextResponse.json(
      { error: `Uživatelské jméno je delší než ${MAX_USERNAME} znaků.` },
      { status: 400 }
    );
  }
  if (typeof appRole !== "string" || !APP_ROLES.includes(appRole as AppRole)) {
    return NextResponse.json(
      { error: "Neplatná aplikační role." },
      { status: 400 }
    );
  }
  if (displayName !== undefined && typeof displayName !== "string") {
    return NextResponse.json({ error: "Neplatné jméno." }, { status: 400 });
  }

  // Heslo generuje aplikace — admin ho uvidí jednou, v DB je jen hash.
  const password = generatePassword();
  const { data, error } = await supabase
    .from("users")
    .insert({
      username: name,
      display_name: (displayName as string | undefined)?.trim() || name,
      app_role: appRole,
      auth_provider: "local",
      password_hash: await hashPassword(password),
      // Heslo se předává mimo aplikaci → vynutit změnu při prvním přihlášení.
      must_change_password: true,
    })
    .select("id, username, display_name, app_role, is_active")
    .single();

  if (error) {
    // 23505 = unique_violation na citext username (case-insensitive).
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Uživatel s tímto jménem už existuje." },
        { status: 409 }
      );
    }
    console.error("Založení uživatele selhalo:", error);
    return NextResponse.json(
      { error: "Založení uživatele se nezdařilo." },
      { status: 500 }
    );
  }

  // Jediné místo a jediný okamžik, kdy se heslo vrací v odpovědi.
  return NextResponse.json({ user: data, password }, { status: 201 });
}
