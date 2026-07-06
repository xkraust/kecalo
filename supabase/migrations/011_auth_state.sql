-- Kecalo — server-side revokace admin session (oprava SEC-4)
-- Jednořádková tabulka: logout posune sessions_invalid_before na now(); token
-- vydaný dřív (jeho ts < sessions_invalid_before) se odmítne v requireAdmin
-- (admin API) i v admin layoutu (stránky). Default epoch = žádná revokace, aby
-- nasazení této migrace nezneplatnilo právě aktivní session. App používá
-- service_role klíč (RLS obchází); RLS je jen zámek anon přístupu jako u ostatních tabulek.

create table if not exists auth_state (
  id                       smallint primary key default 1 check (id = 1),
  sessions_invalid_before  timestamptz not null default '1970-01-01T00:00:00Z',
  updated_at               timestamptz not null default now()
);

-- Výchozí (a jediný) řádek
insert into auth_state (id) values (1) on conflict (id) do nothing;

alter table auth_state enable row level security;
