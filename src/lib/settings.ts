// Server-only přístup k runtime parametrům RAG (tabulka app_settings).
// Jako lib/supabase.ts používá service-role klienta — nikdy neimportovat z klientské komponenty.
import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { setTelemetryExport } from "@/lib/telemetry";
import {
  SETTINGS_FIELDS,
  TELEMETRY_FIELDS,
  parseSettingsInput,
  type SettingsValues,
} from "@/lib/settings-meta";

const SELECT_COLUMNS =
  "top_k, similarity_threshold, llm_temperature, telemetry_enabled, record_content";

type SettingsRow = {
  top_k: number;
  similarity_threshold: number;
  llm_temperature: number;
  telemetry_enabled: boolean;
  record_content: boolean;
};

function fromRow(data: SettingsRow): SettingsValues {
  return {
    topK: data.top_k,
    similarityThreshold: data.similarity_threshold,
    llmTemperature: data.llm_temperature,
    telemetryEnabled: data.telemetry_enabled,
    recordContent: data.record_content,
  };
}

// Runtime fallback z env (config) — když tabulka app_settings chybí nebo DB selže.
const configFallback = (): SettingsValues => ({
  topK: config.topK,
  similarityThreshold: config.similarityThreshold,
  llmTemperature: config.llmTemperature,
  telemetryEnabled: true,
  recordContent: false,
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

export async function saveSettings(input: unknown): Promise<SettingsValues> {
  const values = parseSettingsInput(input);

  const row = Object.fromEntries([
    ...SETTINGS_FIELDS.map((f) => [f.column, values[f.key]]),
    ...TELEMETRY_FIELDS.map((f) => [f.column, values[f.key]]),
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
