// Sdílená metadata a validace runtime parametrů RAG (Fáze 8).
// Bez server-only importů — modul sdílí klient (render slideru), API route (validace) i server.

export interface SettingsValues {
  topK: number;
  similarityThreshold: number;
  llmTemperature: number;
  telemetryEnabled: boolean;
  recordContent: boolean;
}

/** Klíče číselných parametrů (slidery). */
export type NumericSettingKey = "topK" | "similarityThreshold" | "llmTemperature";
/** Klíče přepínačů telemetrie (Fáze 11). */
export type ToggleSettingKey = "telemetryEnabled" | "recordContent";

export interface SettingField {
  /** Klíč v SettingsValues i v JSON payloadu API. */
  key: NumericSettingKey;
  /** Název sloupce v tabulce app_settings. */
  column: "top_k" | "similarity_threshold" | "llm_temperature";
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Formátování hodnoty pro zobrazení (popisek u slideru). */
  format: (value: number) => string;
}

export interface ToggleField {
  /** Klíč v SettingsValues i v JSON payloadu API. */
  key: ToggleSettingKey;
  /** Název sloupce v tabulce app_settings. */
  column: "telemetry_enabled" | "record_content";
  label: string;
  description: string;
  default: boolean;
  /** Volitelná varovná hláška (např. soukromí u záznamu obsahu). */
  warning?: string;
  /**
   * Pole dává smysl jen když je zapnutý tento jiný přepínač. UI ho jinak zašedne,
   * zobrazí jako vypnuté a znemožní změnu (uložená hodnota se ale zachová a po
   * opětovném zapnutí závislosti se obnoví).
   */
  dependsOn?: ToggleSettingKey;
}

// Rozsahy musí odpovídat CHECK v supabase/migrations/003_app_settings.sql.
export const SETTINGS_FIELDS: readonly SettingField[] = [
  {
    key: "topK",
    column: "top_k",
    label: "Počet výsledků (TOP_K)",
    description:
      "Kolik nejpodobnějších chunků se předá modelu jako kontext. Více = širší záběr, ale i víc šumu.",
    min: 1,
    max: 20,
    step: 1,
    default: 5,
    format: (v) => String(Math.round(v)),
  },
  {
    key: "similarityThreshold",
    column: "similarity_threshold",
    label: "Práh podobnosti",
    description:
      "Minimální kosinová podobnost, aby chunk prošel do kontextu. Vyšší = přísnější výběr a snazší fallback.",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
    format: (v) => `${Math.round(v * 100)} %`,
  },
  {
    key: "llmTemperature",
    column: "llm_temperature",
    label: "Teplota modelu",
    description:
      "Míra volnosti odpovědí Claude. Nižší = věcnější a stálejší, vyšší = kreativnější.",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.2,
    format: (v) => v.toFixed(2),
  },
];

// Přepínače telemetrie (Fáze 11). Defaulty musí odpovídat 006_telemetry_settings.sql.
export const TELEMETRY_FIELDS: readonly ToggleField[] = [
  {
    key: "telemetryEnabled",
    column: "telemetry_enabled",
    label: "Telemetrie zapnutá",
    description:
      "Hlavní vypínač. Když je vypnutá, neodesílají se žádné traces do Langfuse (app běží dál).",
    default: true,
  },
  {
    key: "recordContent",
    column: "record_content",
    label: "Zaznamenávat obsah promptů a odpovědí",
    description:
      "Posílá do Langfuse plný text dotazu, kontext z dokumentů a odpověď modelu.",
    default: false,
    warning:
      "Obsahuje reálná data dokumentů i dotazy uživatelů — zapínat jen pro ladění.",
    dependsOn: "telemetryEnabled",
  },
];

function fieldFor(key: NumericSettingKey): SettingField {
  const field = SETTINGS_FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`Neznámý parametr: ${key}`);
  return field;
}

/** Ošetří NaN, ořízne do rozsahu a přichytí na krok (kvůli celočíselnému topK i DB CHECK). */
export function clampField(key: NumericSettingKey, value: number): number {
  const field = fieldFor(key);
  if (!Number.isFinite(value)) return field.default;
  const bounded = Math.min(field.max, Math.max(field.min, value));
  const steps = Math.round((bounded - field.min) / field.step);
  const snapped = field.min + steps * field.step;
  // odstranění chyby plovoucí čárky (např. 0.35000000000000003)
  const rounded = Math.round(snapped * 1000) / 1000;
  return Math.min(field.max, Math.max(field.min, rounded));
}

/** Tolerantní převod na boolean (přijme bool, "true"/"false", 1/0). Jinak default. */
function parseBool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return fallback;
}

/** Z libovolného vstupu (JSON body) sestaví validní, clampnuté hodnoty všech parametrů. */
export function parseSettingsInput(input: unknown): SettingsValues {
  const obj = (
    input && typeof input === "object" ? input : {}
  ) as Record<string, unknown>;

  const result = {} as SettingsValues;
  for (const field of SETTINGS_FIELDS) {
    const raw = obj[field.key];
    const num = typeof raw === "number" ? raw : Number(raw);
    result[field.key] = clampField(field.key, num);
  }
  for (const field of TELEMETRY_FIELDS) {
    result[field.key] = parseBool(obj[field.key], field.default);
  }
  return result;
}

/** Tovární výchozí hodnoty (pro tlačítko „Obnovit výchozí"). */
export const DEFAULT_SETTINGS: SettingsValues = {
  topK: fieldFor("topK").default,
  similarityThreshold: fieldFor("similarityThreshold").default,
  llmTemperature: fieldFor("llmTemperature").default,
  telemetryEnabled: true,
  recordContent: false,
};
