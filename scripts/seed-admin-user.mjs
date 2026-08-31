#!/usr/bin/env node
/**
 * Založí prvního admin uživatele z ADMIN_USERNAME / ADMIN_PASSWORD
 * (etapa A, docs/plans/roles_and_document_access_plan.md).
 *
 * Migrace nemůže hashovat heslo v SQL, proto samostatný skript. Lazy bootstrap
 * při loginu je ZÁMĚRNĚ neimplementovaný — tichý fallback na env údaje je
 * přesně ta cesta, kterou pak nikdo neodstraní a která přežije do produkce
 * jako zadní vrátka.
 *
 * Skript je idempotentní: existující účet nezaloží podruhé a heslo nepřepíše
 * bez --force.
 *
 * Použití:
 *   node scripts/seed-admin-user.mjs            # založí, pokud neexistuje
 *   node scripts/seed-admin-user.mjs --force    # přepíše heslo existujícího účtu
 *   node scripts/seed-admin-user.mjs --username=jan --role=editor
 *
 * Env (z .env.local / .env): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ADMIN_USERNAME, ADMIN_PASSWORD.
 */

import { readFileSync } from "node:fs";
import { randomBytes, scrypt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env — stejně jako langfuse-eval.mjs: .env.local a .env, bez přepisu.
// ---------------------------------------------------------------------------
function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

// ---------------------------------------------------------------------------
// scrypt — musí odpovídat formátu v src/lib/password.ts (scrypt$N$r$p$salt$hash)
// ---------------------------------------------------------------------------
const N = 16384;
const R = 8;
const P = 1;

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(
      password,
      salt,
      64,
      { N, r: R, p: P, maxmem: 128 * N * R * 2 },
      (err, key) =>
        err
          ? reject(err)
          : resolve(
              `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${key.toString("hex")}`
            )
    );
  });
}

// ---------------------------------------------------------------------------
function fail(message) {
  console.error(`Chyba: ${message}`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  fail("Chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.");
}

const username = (args.username || process.env.ADMIN_USERNAME || "").trim();
const password = process.env.ADMIN_PASSWORD || "";
const role = args.role || "admin";

if (!username) fail("Chybí ADMIN_USERNAME (nebo --username=).");
if (!password) fail("Chybí ADMIN_PASSWORD.");
if (password.length < 12) {
  fail("ADMIN_PASSWORD má méně než 12 znaků — zvolte delší heslo.");
}
if (!["admin", "editor", "viewer"].includes(role)) {
  fail(`Neplatná role "${role}" (admin/editor/viewer).`);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const { data: existing, error: selectErr } = await supabase
  .from("users")
  .select("id, username, app_role")
  .eq("username", username)
  .maybeSingle();

if (selectErr) {
  fail(
    `Dotaz na tabulku users selhal: ${selectErr.message}\n` +
      "Je aplikovaná migrace 014_users_roles.sql? (supabase db push)"
  );
}

const passwordHash = await hashPassword(password);

if (existing) {
  if (!args.force) {
    console.log(
      `Uživatel "${existing.username}" už existuje (role ${existing.app_role}) — nic se nemění.\n` +
        "Heslo přepíšete pomocí --force."
    );
    process.exit(0);
  }
  const { error } = await supabase
    .from("users")
    .update({
      password_hash: passwordHash,
      is_active: true,
      updated_at: new Date().toISOString(),
      // Přepis hesla ukončí běžící session (invariant 10 plánu rolí).
      sessions_invalid_before: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (error) fail(`Aktualizace hesla selhala: ${error.message}`);
  console.log(`Heslo uživatele "${username}" přepsáno, session odhlášeny.`);
  process.exit(0);
}

const { error: insertErr } = await supabase.from("users").insert({
  username,
  display_name: username,
  app_role: role,
  auth_provider: "local",
  password_hash: passwordHash,
});

if (insertErr) fail(`Založení uživatele selhalo: ${insertErr.message}`);

console.log(`Uživatel "${username}" založen s rolí ${role}.`);
