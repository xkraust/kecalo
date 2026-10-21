-- Kecalo — explicitní oprávnění pro service_role
--
-- Od 30. 10. 2026 Supabase přestane automaticky dávat Data API oprávnění
-- novým tabulkám ve schématu public. Existující tabulky grants zachovají,
-- ale čerstvá instalace (nový projekt, preview branch, `supabase db reset`)
-- by z migrací 001–020 dostala tabulky BEZ přístupu a aplikace by padala na
-- „permission denied".
--
-- Aplikace sahá do DB výhradně přes service-role klíč, takže grant dostává
-- jen service_role. anon a authenticated ZÁMĚRNĚ nic: tabulky jsou zavřené
-- přes RLS (004 a další) a klient s Supabase nikdy nemluví přímo.
--
-- Idempotentní — na produkci, kde oprávnění už existují, je to no-op.
--
-- PRAVIDLO PRO BUDOUCÍ MIGRACE: každá migrace s `create table` přidá hned
-- za tabulku vlastní `grant ... to service_role`.

grant select, insert, update, delete on public.documents          to service_role;
grant select, insert, update, delete on public.chunks             to service_role;
grant select, insert, update, delete on public.app_settings       to service_role;
grant select, insert, update, delete on public.feedback           to service_role;
grant select, insert, update, delete on public.leads              to service_role;
grant select, insert, update, delete on public.auth_state         to service_role;
grant select, insert, update, delete on public.users             to service_role;
grant select, insert, update, delete on public.audiences          to service_role;
grant select, insert, update, delete on public.job_roles          to service_role;
grant select, insert, update, delete on public.job_role_audiences to service_role;
grant select, insert, update, delete on public.user_job_roles     to service_role;
grant select, insert, update, delete on public.document_audiences to service_role;
grant select, insert, update, delete on public.privacy_actions    to service_role;

-- view z migrace 016 (jen čtení)
grant select on public.user_effective_audiences to service_role;
