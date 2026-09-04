// Server-only přístup k runtime parametrům RAG (tabulka app_settings).
// Jako lib/supabase.ts používá service-role klienta — nikdy neimportovat z klientské komponenty.
import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { setTelemetryExport } from "@/lib/telemetry";
import {
  ALL_NUMERIC_FIELDS,
  ALL_TOGGLE_FIELDS,
  PROMPT_FIELDS,
  RETENTION_SLIDER_FIELDS,
  RETENTION_TOGGLE_FIELDS,
  LEAD_CAPTURE_FIELDS,
  DEFAULT_SETTINGS,
  parseSettingsInput,
  parsePrivacyInput,
  type SettingsValues,
  type DocumentVisibility,
} from "@/lib/settings-meta";

const SELECT_COLUMNS =
  "top_k, similarity_threshold, llm_temperature, telemetry_enabled, record_content, " +
  "chunk_target_size, chunk_breadcrumb, chunk_strip_headers, " +
  "system_prompt, lead_summary_prompt, default_document_visibility, " +
  "retention_enabled, retention_leads_months, retention_feedback_months, lead_capture_enabled";

type SettingsRow = {
  top_k: number;
  similarity_threshold: number;
  llm_temperature: number;
  telemetry_enabled: boolean;
  record_content: boolean;
  chunk_target_size: number;
  chunk_breadcrumb: boolean;
  chunk_strip_headers: boolean;
  system_prompt: string | null;
  lead_summary_prompt: string | null;
  default_document_visibility: DocumentVisibility;
  retention_enabled: boolean;
  retention_leads_months: number;
  retention_feedback_months: number;
  lead_capture_enabled: boolean;
};

function fromRow(data: SettingsRow): SettingsValues {
  return {
    topK: data.top_k,
    similarityThreshold: data.similarity_threshold,
    llmTemperature: data.llm_temperature,
    telemetryEnabled: data.telemetry_enabled,
    recordContent: data.record_content,
    chunkTargetSize: data.chunk_target_size,
    chunkBreadcrumb: data.chunk_breadcrumb,
    chunkStripHeaders: data.chunk_strip_headers,
    systemPrompt: data.system_prompt,
    leadSummaryPrompt: data.lead_summary_prompt,
    defaultDocumentVisibility: data.default_document_visibility,
    retentionEnabled: data.retention_enabled,
    retentionLeadsMonths: data.retention_leads_months,
    retentionFeedbackMonths: data.retention_feedback_months,
    leadCaptureEnabled: data.lead_capture_enabled,
  };
}

// Runtime fallback z env (config) — když tabulka app_settings chybí nebo DB selže.
// Chunkovací parametry env nemají, berou se tovární defaulty.
const configFallback = (): SettingsValues => ({
  ...DEFAULT_SETTINGS,
  topK: config.topK,
  similarityThreshold: config.similarityThreshold,
  llmTemperature: config.llmTemperature,
});

export async function getSettings(): Promise<SettingsValues> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select(SELECT_COLUMNS)
      .eq("id", 1)
      .single<SettingsRow>();

    const values = error || !data ? configFallback() : fromRow(data);
    // Promítnout master vypínač do runtime flagu telemetrie (čte ho shouldExportSpan).
    setTelemetryExport(values.telemetryEnabled);
    return values;
  } catch {
    const values = configFallback();
    setTelemetryExport(values.telemetryEnabled);
    return values;
  }
}

/**
 * Uložení parametrů soukromí (/admin/privacy): retence a sběr kontaktů.
 *
 * ZÁMĚRNĚ samostatná funkce, ne rozšíření `saveSettings`: stránka „RAG
 * parametry" tak tyhle sloupce vůbec nezapisuje a její „Obnovit výchozí"
 * nemůže vypnout retenci ani znovu zapnout sběr kontaktů. Chybějící pole ve
 * vstupu se berou z aktuálně uložených hodnot, ne z továrních defaultů.
 */
export async function savePrivacySettings(
  input: unknown
): Promise<SettingsValues> {
  const current = await getSettings();
  const values = parsePrivacyInput(input, current);

  const row = Object.fromEntries([
    ...RETENTION_SLIDER_FIELDS.map((f) => [f.column, values[f.key]]),
    ...RETENTION_TOGGLE_FIELDS.map((f) => [f.column, values[f.key]]),
    ...LEAD_CAPTURE_FIELDS.map((f) => [f.column, values[f.key]]),
  ]);

  const { data, error } = await supabase
    .from("app_settings")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select(SELECT_COLUMNS)
    .single<SettingsRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Uložení parametrů soukromí selhalo");
  }
  return fromRow(data);
}

export async function saveSettings(input: unknown): Promise<SettingsValues> {
  const values = parseSettingsInput(input);

  const row = Object.fromEntries([
    ...ALL_NUMERIC_FIELDS.map((f) => [f.column, values[f.key]]),
    ...ALL_TOGGLE_FIELDS.map((f) => [f.column, values[f.key]]),
    // Prompty: null se uloží jako NULL = platí výchozí konstanta v kódu (Fáze 17).
    ...PROMPT_FIELDS.map((f) => [f.column, values[f.key]]),
    ["default_document_visibility", values.defaultDocumentVisibility],
  ]);

  const { data, error } = await supabase
    .from("app_settings")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select(SELECT_COLUMNS)
    .single<SettingsRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Uložení nastavení selhalo");
  }

  const saved = fromRow(data);
  // Okamžitě promítnout změnu master vypínače do runtime flagu.
  setTelemetryExport(saved.telemetryEnabled);
  return saved;
}
