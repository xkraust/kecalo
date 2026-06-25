-- Kecalo — runtime přepínače telemetrie (Fáze 11)
-- Rozšiřuje jednořádkovou tabulku app_settings o dva boolean přepínače editovatelné
-- v /admin/parameters (podsekce „Telemetrie"):
--   telemetry_enabled — master vypínač exportu traces do Langfuse
--   record_content    — zaznamenávat obsah promptů a odpovědí (recordInputs/recordOutputs)
-- Defaulty musí odpovídat ToggleField.default v src/lib/settings-meta.ts.

alter table app_settings
  add column telemetry_enabled boolean not null default true,
  add column record_content    boolean not null default false;
