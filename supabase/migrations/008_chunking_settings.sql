-- Fáze 13: runtime parametry chunkování + otisk konfigurace u dokumentu.
-- Rozsahy CHECK musí odpovídat min/max v src/lib/settings-meta.ts (CHUNKING_SLIDER_FIELDS).

alter table app_settings
  add column if not exists chunk_target_size int not null default 3500
    check (chunk_target_size between 1500 and 6000),
  add column if not exists chunk_breadcrumb boolean not null default true,
  add column if not exists chunk_strip_headers boolean not null default true;

-- Otisk konfigurace chunkování použité při poslední indexaci dokumentu.
-- NULL (dokumenty indexované před touto fází) se považuje za zastaralou konfiguraci.
alter table documents
  add column if not exists chunking_config jsonb;
