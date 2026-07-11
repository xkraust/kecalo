-- Typ poptávky (Fáze 16 — zpětná vazba → lead):
--   'produkt'   = zájem o produkt (token [[NABIDKA]] v chatu; dosavadní chování)
--   'hodnoceni' = kontakt zanechaný po palci dolů u odpovědi (nespokojenost)
-- ASCII hodnoty v DB, diakritika jen v UI (LeadTypeBadge). Stávající řádky
-- dostanou 'produkt' přes DEFAULT. CHECK je druhá obranná linie — whitelist
-- vynucuje už API (konvence projektu, viz 010_leads.sql).
alter table leads
  add column type text not null default 'produkt'
  check (type in ('produkt', 'hodnoceni'));
