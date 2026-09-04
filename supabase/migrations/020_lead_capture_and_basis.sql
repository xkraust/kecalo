-- Kecalo — provozní režim: sběr poptávek a právní titul zpracování
-- (etapa G, docs/plans/gdpr_plan.md)
--
-- Provozní režim se ZÁMĚRNĚ neukládá jako jeden přepínač „veřejná / interní".
-- Jeden boolean by se rozvětvil do desítek podmínek a hlavně by měnil
-- GDPR-relevantní chování jedním kliknutím v adminu. Místo toho: hranice
-- „smí se ptát anonym" patří do env (PUBLIC_CHAT), chování je nezávislý
-- parametr (níže) a režim se jen odvozuje a zobrazuje.

-- Sběr poptávek jako samostatný parametr. DEFAULT true = dnešní chování;
-- interní nasazení, kde poptávky nedávají smysl, si ho vypne.
alter table app_settings
  add column if not exists lead_capture_enabled boolean not null default true;

-- Právní titul, pod kterým záznam vznikl.
--
-- Ukládá se K ŘÁDKU, ne do nastavení: titul se váže k okamžiku sběru, takže
-- po pozdější změně konfigurace by u starých řádků nebyl doložitelný
-- (zásada odpovědnosti, čl. 5 odst. 2).
--
-- Hodnota se odvíjí od TABULKY, ne od toho, zda byl volající přihlášený:
--   leads    = vždy 'souhlas' — jediné místo, kde se souhlas checkboxem sbírá
--   feedback = vždy 'opravneny_zajem' — u palce se žádný souhlas nesbírá,
--              takže anonymnímu hlasu nesmí spadnout titul, který nikdy
--              nebyl udělen
-- DEFAULT proto zároveň správně doplní i všechny existující řádky.
alter table leads
  add column if not exists processing_basis text not null default 'souhlas'
  check (processing_basis in ('souhlas', 'opravneny_zajem'));

alter table feedback
  add column if not exists processing_basis text not null default 'opravneny_zajem'
  check (processing_basis in ('souhlas', 'opravneny_zajem'));
