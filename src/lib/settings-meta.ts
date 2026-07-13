// Sdílená metadata a validace runtime parametrů RAG (Fáze 8).
// Bez server-only importů — modul sdílí klient (render slideru), API route (validace) i server.

export interface SettingsValues {
  topK: number;
  similarityThreshold: number;
  llmTemperature: number;
  telemetryEnabled: boolean;
  recordContent: boolean;
  chunkTargetSize: number;
  chunkBreadcrumb: boolean;
  chunkStripHeaders: boolean;
  /** Override system promptu chatu; null = výchozí konstanta v kódu (Fáze 17). */
  systemPrompt: string | null;
  /** Override promptu shrnutí poptávek; null = výchozí konstanta v kódu. */
  leadSummaryPrompt: string | null;
}

/** Klíče číselných parametrů (slidery). */
export type NumericSettingKey =
  | "topK"
  | "similarityThreshold"
  | "llmTemperature"
  | "chunkTargetSize";
/** Klíče booleovských přepínačů (telemetrie — Fáze 11, chunkování — Fáze 13). */
export type ToggleSettingKey =
  | "telemetryEnabled"
  | "recordContent"
  | "chunkBreadcrumb"
  | "chunkStripHeaders";
/** Klíče textových polí — prompty (Fáze 17). */
export type TextSettingKey = "systemPrompt" | "leadSummaryPrompt";

export interface SettingField {
  /** Klíč v SettingsValues i v JSON payloadu API. */
  key: NumericSettingKey;
  /** Název sloupce v tabulce app_settings. */
  column: "top_k" | "similarity_threshold" | "llm_temperature" | "chunk_target_size";
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
  column:
    | "telemetry_enabled"
    | "record_content"
    | "chunk_breadcrumb"
    | "chunk_strip_headers";
  label: string;
  description: string;
  default: boolean;
  /** Volitelná varovná hláška (např. soukromí u záznamu obsahu). */
  warning?: string;
  /**
   * Pole dává smysl jen když je zapnutý tento jiný přepínač. UI ho jinak zašedne
   * a znemožní změnu — hodnotu ale nemění (přepínač zobrazuje skutečnou uloženou
   * hodnotu, jen je disabled).
   */
  dependsOn?: ToggleSettingKey;
}

export interface TextField {
  /** Klíč v SettingsValues i v JSON payloadu API. */
  key: TextSettingKey;
  /** Název sloupce v tabulce app_settings. */
  column: "system_prompt" | "lead_summary_prompt";
  label: string;
  description: string;
  /** Musí odpovídat CHECK v 013_prompt_settings.sql. */
  maxLength: number;
  warning?: string;
}

// Prompty (Fáze 17). Hodnota null = výchozí konstanta v kódu (src/lib/rag/prompts.ts) —
// vylepšení defaultů se tak propisují s deployi; override vzniká jen editací v adminu.
export const PROMPT_FIELDS: readonly TextField[] = [
  {
    key: "systemPrompt",
    column: "system_prompt",
    label: "Systémový prompt chatu",
    description:
      "Řídí chování bota při odpovídání z dokumentů (zdroje, citace, tón, nabídka kontaktu). Změna se projeví okamžitě, bez reindexace.",
    maxLength: 8000,
    warning:
      "Prompt obsahuje instrukci k tokenu [[NABIDKA]], která spouští kartu poptávky v chatu a metriku offer_correct v evaluacích. Její odstranění nebo změna vypne sběr poptávek.",
  },
  {
    key: "leadSummaryPrompt",
    column: "lead_summary_prompt",
    label: "Prompt shrnutí poptávky",
    description:
      "Řídí shrnutí konverzace při založení poptávky (Mistral model; zobrazuje se zpracovateli v sekci Poptávky). Změna se projeví okamžitě.",
    maxLength: 4000,
    warning:
      "Prompt obsahuje bezpečnostní formulaci (SEC-9): přepis konverzace je nedůvěryhodná data, ne instrukce. Její oslabení umožní prompt injection do admin UI.",
  },
];

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

// Parametry chunkování (Fáze 13). Působí při INDEXACI — změna se projeví až
// reindexací dokumentů (na rozdíl od parametrů výše, které působí při dotazu).
// Rozsahy a defaulty musí odpovídat CHECK v 008_chunking_settings.sql.
export const CHUNKING_SLIDER_FIELDS: readonly SettingField[] = [
  {
    key: "chunkTargetSize",
    column: "chunk_target_size",
    label: "Cílová velikost chunku",
    description:
      "Kolik znaků má mít jeden chunk při indexaci. Menší chunky = přesnější zásahy retrievalu, větší = víc souvislého kontextu v jednom kuse.",
    min: 1500,
    max: 6000,
    step: 100,
    default: 3500,
    format: (v) => `${Math.round(v)} znaků`,
  },
];

export const CHUNKING_TOGGLE_FIELDS: readonly ToggleField[] = [
  {
    key: "chunkBreadcrumb",
    column: "chunk_breadcrumb",
    label: "Breadcrumb hlavička chunku",
    description:
      "Na začátek každého chunku vloží cestu v dokumentu (dokument › část › článek › odstavec), která se embeduje spolu s textem — zlepšuje zacílení retrievalu.",
    default: true,
  },
  {
    key: "chunkStripHeaders",
    column: "chunk_strip_headers",
    label: "Odstraňovat záhlaví a patičky stránek",
    description:
      "Před chunkováním odstraní řádky opakující se na většině stránek (záhlaví, čísla stránek), aby nešuměly v embeddinzích.",
    default: true,
  },
];

/** Všechna číselná pole napříč skupinami (validace, ukládání). */
export const ALL_NUMERIC_FIELDS: readonly SettingField[] = [
  ...SETTINGS_FIELDS,
  ...CHUNKING_SLIDER_FIELDS,
];
/** Všechny přepínače napříč skupinami (validace, ukládání). */
export const ALL_TOGGLE_FIELDS: readonly ToggleField[] = [
  ...TELEMETRY_FIELDS,
  ...CHUNKING_TOGGLE_FIELDS,
];

function fieldFor(key: NumericSettingKey): SettingField {
  const field = ALL_NUMERIC_FIELDS.find((f) => f.key === key);
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

/** Textové pole promptu: ne-string / prázdný po trim → null (výchozí z kódu);
 * jinak trim + ořez na maxLength (třetí vrstva je DB CHECK). */
export function parseTextField(field: TextField, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, field.maxLength);
}

/** Z libovolného vstupu (JSON body) sestaví validní, clampnuté hodnoty všech parametrů. */
export function parseSettingsInput(input: unknown): SettingsValues {
  const obj = (
    input && typeof input === "object" ? input : {}
  ) as Record<string, unknown>;

  const result = {} as SettingsValues;
  for (const field of ALL_NUMERIC_FIELDS) {
    const raw = obj[field.key];
    const num = typeof raw === "number" ? raw : Number(raw);
    result[field.key] = clampField(field.key, num);
  }
  for (const field of ALL_TOGGLE_FIELDS) {
    result[field.key] = parseBool(obj[field.key], field.default);
  }
  for (const field of PROMPT_FIELDS) {
    result[field.key] = parseTextField(field, obj[field.key]);
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
  chunkTargetSize: fieldFor("chunkTargetSize").default,
  chunkBreadcrumb: true,
  chunkStripHeaders: true,
  systemPrompt: null,
  leadSummaryPrompt: null,
};

/** Otisk konfigurace chunkování ukládaný k dokumentu (documents.chunking_config). */
export interface ChunkingConfig {
  target_size: number;
  breadcrumb: boolean;
  strip_headers: boolean;
}

export function chunkingConfigOf(values: SettingsValues): ChunkingConfig {
  return {
    target_size: values.chunkTargetSize,
    breadcrumb: values.chunkBreadcrumb,
    strip_headers: values.chunkStripHeaders,
  };
}

/**
 * Dokument má zastaralé chunkování, když otisk chybí (NULL — indexace před
 * Fází 13) nebo neodpovídá aktuálnímu nastavení.
 */
export function isChunkingStale(config: unknown, values: SettingsValues): boolean {
  if (!config || typeof config !== "object") return true;
  const c = config as Partial<ChunkingConfig>;
  const now = chunkingConfigOf(values);
  return (
    c.target_size !== now.target_size ||
    c.breadcrumb !== now.breadcrumb ||
    c.strip_headers !== now.strip_headers
  );
}
