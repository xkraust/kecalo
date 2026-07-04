-- Kecalo — tabulka poptávek (lead generation, Fáze 14)
-- Ukládá kontakty návštěvníků, kteří po produktovém dotazu požádali o spojení.
-- Poptávky se nikdy nemažou — uzavření jen nastaví status 'closed'.

create table leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 100),
  email       text check (char_length(email) <= 120),
  phone       text check (char_length(phone) <= 20),
  -- limit 500 znaků na JEDNU poznámku vynucuje API; sloupec má vyšší strop,
  -- protože deduplikace poznámky připojuje a součet by check 500 shodil
  note        text check (char_length(note) <= 5000),
  summary     text,                -- LLM shrnutí konverzace pro zpracovatele (nahrazuje surový dotaz)
  session_id  text,
  status      text not null default 'new'
              check (status in ('new', 'updated', 'in_progress', 'closed')),
  assignee    text,                -- jméno zpracovatele (zatím jen 'admin'; příprava na CRM)
  -- souhlas se zpracováním OÚ; API vrací 400, check je druhá obranná linie
  consent     boolean not null check (consent),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  check (email is not null or phone is not null)
);

-- Konvence projektu (viz 004/005): RLS na každé tabulce; leads obsahuje osobní
-- údaje — bez RLS by byla čitelná přes PostgREST s anon klíčem.
alter table leads enable row level security;
