-- Kecalo — uživatelé a aplikační role (etapa A, docs/plans/roles_and_document_access_plan.md)
-- Nahrazuje jedinou identitu z env (ADMIN_USERNAME/ADMIN_PASSWORD) tabulkou
-- uživatelů s aplikační rolí. Env údaje slouží už jen k seedu prvního admina
-- (scripts/seed-admin-user.mjs), ne k běhovému ověřování.
--
-- Schéma je připravené i na pozdější SSO (etapa D): auth_provider rozlišuje
-- lokální heslo od OIDC identity, takže napojení IdP nevyžaduje migraci dat.
-- App používá service_role klíč (RLS obchází); RLS je jen zámek anon přístupu.

-- citext = case-insensitive text: uživatelské jméno se nesmí lišit velikostí písmen
create extension if not exists citext;

create table users (
  id             uuid primary key default gen_random_uuid(),
  username       citext not null unique check (char_length(username) between 2 and 120),
  display_name   text check (char_length(display_name) <= 120),

  -- Aplikační role = co uživatel smí dělat. DEFAULT 'viewer' je bezpečnostní
  -- default zakotvený ve schématu: nově založený uživatel (z admin UI i z JIT
  -- provisioningu při SSO) dostane nejnižší oprávnění i tehdy, když ho
  -- zakládající kód opomene nastavit. Vyšší roli musí někdo přidělit vědomě.
  app_role       text not null default 'viewer'
                 check (app_role in ('admin', 'editor', 'viewer')),

  auth_provider  text not null default 'local'
                 check (auth_provider in ('local', 'oidc')),
  password_hash  text,              -- jen local (formát scrypt$N$r$p$salt$hash)
  external_issuer  text,            -- jen oidc — claim `iss`
  external_subject text,            -- jen oidc — claim `sub` (neměnné id u vydavatele)

  is_active      boolean not null default true,

  -- Per-user revokace session: logout, deaktivace, reset hesla i změna rolí
  -- posunou hranici na now(), takže dřív vydaný token je odmítnut. Globální
  -- auth_state (migrace 011) zůstává jako ruční kill-switch pro incident.
  sessions_invalid_before timestamptz not null default '1970-01-01T00:00:00Z',

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Lokální účet musí mít heslo, OIDC účet musí mít external_subject.
  -- Brání vzniku účtu, který nejde ověřit ani jednou cestou.
  constraint users_provider_credentials check (
    (auth_provider = 'local' and password_hash is not null)
    or (auth_provider = 'oidc' and external_subject is not null)
  ),

  -- Identita SSO uživatele stojí na dvojici (vydavatel, subjekt) — nikdy na
  -- e-mailu, který se mění a jde u jiného vydavatele nastavit shodně.
  -- U lokálních účtů jsou oba sloupce NULL; NULL se v UNIQUE nerovná samo
  -- sobě, takže lokálních účtů může být libovolně mnoho.
  constraint users_external_identity unique (external_issuer, external_subject)
);

alter table users enable row level security;
