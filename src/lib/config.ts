const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
};

export const config = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  // ADMIN_USERNAME / ADMIN_PASSWORD tu záměrně nejsou: od etapy A plánu rolí
  // se přihlašuje proti tabulce `users`. Env údaje slouží jen skriptu
  // scripts/seed-admin-user.mjs, který si je načte sám.
  sessionSecret: required("SESSION_SECRET"),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  voyageApiKey: required("VOYAGE_API_KEY"),
  chatModel: process.env.CHAT_MODEL ?? "claude-sonnet-4-6",
  // Sumarizace konverzace u poptávek — prototypový test Mistral modelu (Varianta B,
  // viz docs/plans/mistral_summary_experiment_plan.md). Levnější kompresní úloha; volá se
  // přes @ai-sdk/mistral, klíč MISTRAL_API_KEY čte provider z env automaticky.
  summaryModel: process.env.SUMMARY_MODEL ?? "mistral-small-latest",
  topK: parseInt(process.env.TOP_K ?? "5", 10),
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD ?? "0.35"),
  llmTemperature: parseFloat(process.env.LLM_TEMPERATURE ?? "0.2"),
} as const;
