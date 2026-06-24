-- Kecalo — zapnutí Row-Level Security na všech tabulkách (Supabase security fix)
-- Žádné policy pro anon/authenticated = veřejný přístup přes PostgREST je zcela zablokován.
-- Aplikace používá service_role klíč, který RLS obchází → žádný dopad na funkčnost.

alter table documents enable row level security;
alter table chunks enable row level security;
alter table app_settings enable row level security;
