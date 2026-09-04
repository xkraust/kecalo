-- Kecalo — retenční parametry a auditní stopa zpracování osobních údajů
-- (etapa A, docs/plans/gdpr_plan.md)
--
-- Doplňuje dvě věci, bez kterých GDPR nejde splnit: omezenou dobu uložení
-- (čl. 5 odst. 1 písm. e) a doložitelnost provedených úkonů (čl. 5 odst. 2).

-- Retenční parametry. Rozsahy musí odpovídat min/max v src/lib/settings-meta.ts
-- (RETENTION_* skupiny) — CHECK je druhá obranná linie, jako u ostatních
-- parametrů v app_settings.
--
-- retention_enabled je ZÁMĚRNĚ false: nasazení migrace nesmí nic smazat dřív,
-- než správce lhůty vědomě potvrdí. Mazání je nevratné, takže se zapíná ručně.
alter table app_settings
  add column if not exists retention_enabled boolean not null default false,
  add column if not exists retention_leads_months int not null default 24
    check (retention_leads_months between 1 and 120),
  add column if not exists retention_feedback_months int not null default 6
    check (retention_feedback_months between 1 and 120);

-- Auditní stopa výmazů — zásada odpovědnosti (čl. 5 odst. 2): u každého smazání
-- musí jít doložit, že proběhlo, kdy a v jakém rozsahu.
--
-- Tabulka ZÁMĚRNĚ neobsahuje osobní údaje v čitelné podobě: místo kontaktu jen
-- klíčovaný otisk (HMAC-SHA256, src/lib/privacy/contact.ts). Prostý SHA-256 by
-- nestačil — prostor telefonních čísel je malý a slovníkově prolomitelný, takže
-- by evidence sama byla dalším zpracováním osobních údajů. HMAC se serverovým
-- tajemstvím plní auditní účel („tento výmaz proběhl") stejně dobře.
create table privacy_actions (
  id               uuid primary key default gen_random_uuid(),
  -- 'retention' = automatický/ruční úklid podle lhůt (subject_hash je NULL),
  -- 'erasure'   = výmaz na žádost konkrétního subjektu (subject_hash vyplněn)
  kind             text not null check (kind in ('retention', 'erasure')),
  subject_hash     text check (char_length(subject_hash) <= 64),
  leads_deleted    int not null default 0 check (leads_deleted >= 0),
  feedback_deleted int not null default 0 check (feedback_deleted >= 0),
  -- kdo úkon provedl; NULL = cron (běží bez přihlášeného uživatele).
  -- ON DELETE SET NULL: uživatelé se sice nemažou (jen deaktivují), ale auditní
  -- zápis nesmí být tím, co by případnému mazání účtu bránilo.
  performed_by     uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- Výpis v /admin/privacy řadí od nejnovějšího.
create index if not exists privacy_actions_created_at_idx
  on privacy_actions (created_at desc);

-- Konvence projektu (viz 004/005/010): RLS na každé tabulce, bez policy pro anon.
-- Aplikace čte přes service-role klíč, který RLS obchází.
alter table privacy_actions enable row level security;
