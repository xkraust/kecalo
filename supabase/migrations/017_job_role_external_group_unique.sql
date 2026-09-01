-- Kecalo — jedna skupina z IdP smí mapovat nejvýš na jednu pracovní roli
-- (etapa D plánu rolí, doplněk).
--
-- Bez tohoto omezení by dvě role se stejným `external_group` daly nositeli
-- skupiny sjednocení obou sad štítků. Nešlo by o útok, ale o tichou chybu
-- admina — uživatel by viděl víc, než měl, a nikde by to nebylo vidět.
-- Partial index (jen NOT NULL) proto, že rolí bez mapování na skupinu může být
-- libovolně mnoho: většina organizací mapuje jen část rolí.
create unique index if not exists job_roles_external_group_key
  on job_roles (external_group)
  where external_group is not null;
