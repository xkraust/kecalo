// Správa uživatelů (etapa B plánu rolí). Jen pro aplikační roli `admin`.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAppRole } from "@/lib/require-role";
import { generatePassword, hashPassword } from "@/lib/password";
import type { AppRole } from "@/lib/session-user";
import {
  isValidEmail,
  isValidPersonName,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
} from "@/lib/validation";

const APP_ROLES: AppRole[] = ["admin", "editor", "viewer"];

export async function GET() {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from("users")
    .select(
      "id, email, first_name, last_name, app_role, auth_provider, is_active, must_change_password, created_at"
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

  const { email, firstName, lastName, appRole } = body as {
    email?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    appRole?: unknown;
  };

  if (typeof firstName !== "string" || !isValidPersonName(firstName)) {
    return NextResponse.json(
      { error: `Jméno je povinné (max. ${MAX_NAME_LENGTH} znaků).` },
      { status: 400 }
    );
  }
  if (typeof lastName !== "string" || !isValidPersonName(lastName)) {
    return NextResponse.json(
      { error: `Příjmení je povinné (max. ${MAX_NAME_LENGTH} znaků).` },
      { status: 400 }
    );
  }
  if (typeof email !== "string" || !isValidEmail(email.trim())) {
    return NextResponse.json(
      { error: `Zadejte platnou e-mailovou adresu (max. ${MAX_EMAIL_LENGTH} znaků).` },
      { status: 400 }
    );
  }
  if (typeof appRole !== "string" || !APP_ROLES.includes(appRole as AppRole)) {
    return NextResponse.json(
      { error: "Neplatná aplikační role." },
      { status: 400 }
    );
  }

  // Heslo generuje aplikace — admin ho uvidí jednou, v DB je jen hash.
  const password = generatePassword();
  const { data, error } = await supabase
    .from("users")
    .insert({
      email: email.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      app_role: appRole,
      auth_provider: "local",
      password_hash: await hashPassword(password),
      // Heslo se předává mimo aplikaci → vynutit změnu při prvním přihlášení.
      must_change_password: true,
    })
    .select("id, email, first_name, last_name, app_role, is_active")
    .single();

  if (error) {
    // 23505 = unique_violation na citext username (case-insensitive).
    if (error.code === "23505") {
      // email je citext → kolize nastane i při jiné velikosti písmen.
      return NextResponse.json(
        { error: "Uživatel s tímto e-mailem už existuje." },
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
