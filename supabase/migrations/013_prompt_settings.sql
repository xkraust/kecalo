-- Fáze 17: runtime editovatelné prompty (system prompt chatu + prompt shrnutí poptávek).
--
-- ZÁMĚRNÁ ODCHYLKA od konvence app_settings (NOT NULL + DB default):
-- sloupce jsou NULLABLE a NULL znamená „použij konstantu v kódu"
-- (src/lib/rag/prompts.ts — SYSTEM_PROMPT / LEAD_SUMMARY_PROMPT).
-- Default textu promptu se vyvíjí s deployi aplikace — kdyby byl zkopírovaný
-- v DB, po deployi s vylepšeným promptem by dál tiše platila zastaralá kopie.
-- Override se uloží jen při vědomé editaci adminem v /admin/parameters/prompts;
-- „Obnovit výchozí" vrací NULL.
--
-- Limity délky musí odpovídat maxLength v src/lib/settings-meta.ts (PROMPT_FIELDS);
-- CHECK je druhá obranná linie (konvence projektu).
alter table app_settings
  add column if not exists system_prompt text
    check (system_prompt is null or char_length(system_prompt) <= 8000),
  add column if not exists lead_summary_prompt text
    check (lead_summary_prompt is null or char_length(lead_summary_prompt) <= 4000);
