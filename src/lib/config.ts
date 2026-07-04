const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
};

export const config = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  adminUsername: required("ADMIN_USERNAME"),
  adminPassword: required("ADMIN_PASSWORD"),
  sessionSecret: required("SESSION_SECRET"),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  voyageApiKey: required("VOYAGE_API_KEY"),
  chatModel: process.env.CHAT_MODEL ?? "claude-sonnet-4-6",
  // Sumarizace konverzace u poptávek — jednoduchá kompresní úloha, stačí Haiku.
  summaryModel: process.env.SUMMARY_MODEL ?? "claude-haiku-4-5",
  topK: parseInt(process.env.TOP_K ?? "5", 10),
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD ?? "0.35"),
  llmTemperature: parseFloat(process.env.LLM_TEMPERATURE ?? "0.2"),
} as const;
