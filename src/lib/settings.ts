// Server-only přístup k runtime parametrům RAG (tabulka app_settings).
// Jako lib/supabase.ts používá service-role klienta — nikdy neimportovat z klientské komponenty.
import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import {
  SETTINGS_FIELDS,
  parseSettingsInput,
  type SettingsValues,
} from "@/lib/settings-meta";

// Runtime fallback z env (config) — když tabulka app_settings chybí nebo DB selže.
const configFallback = (): SettingsValues => ({
  topK: config.topK,
  similarityThreshold: config.similarityThreshold,
  llmTemperature: config.llmTemperature,
});

export async function getSettings(): Promise<SettingsValues> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("top_k, similarity_threshold, llm_temperature")
      .eq("id", 1)
      .single();

    if (error || !data) return configFallback();

    return {
      topK: data.top_k,
      similarityThreshold: data.similarity_threshold,
      llmTemperature: data.llm_temperature,
    };
  } catch {
    return configFallback();
  }
}

export async function saveSettings(input: unknown): Promise<SettingsValues> {
  const values = parseSettingsInput(input);

  const row = Object.fromEntries(
    SETTINGS_FIELDS.map((f) => [f.column, values[f.key]])
  );

  const { data, error } = await supabase
    .from("app_settings")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("top_k, similarity_threshold, llm_temperature")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Uložení nastavení selhalo");
  }

  return {
    topK: data.top_k,
    similarityThreshold: data.similarity_threshold,
    llmTemperature: data.llm_temperature,
  };
}
