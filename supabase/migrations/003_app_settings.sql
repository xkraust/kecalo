-- Kecalo — globální runtime parametry RAG (Fáze 8)
-- Jednořádková konfigurační tabulka editovatelná v /admin/parameters.
-- Hodnoty přepisují env defaulty (TOP_K, SIMILARITY_THRESHOLD, LLM_TEMPERATURE).
-- Rozsahy v CHECK musí odpovídat min/max v src/lib/settings-meta.ts
-- (settings-meta je jediný zdroj pravdy; CHECK je druhá obranná linie na úrovni DB).

create table app_settings (
  id                   smallint primary key default 1 check (id = 1),
  top_k                int not null default 5
                         check (top_k between 1 and 20),
  similarity_threshold double precision not null default 0.35
                         check (similarity_threshold between 0 and 1),
  llm_temperature      double precision not null default 0.2
                         check (llm_temperature between 0 and 1),
  updated_at           timestamptz not null default now()
);

-- Výchozí (a jediný) řádek konfigurace
insert into app_settings (id) values (1) on conflict (id) do nothing;
