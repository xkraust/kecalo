import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { langfuseEnabled, langfuseSpanProcessor } from "@/lib/telemetry";

// Guard proti dvojí registraci — Next.js dev/HMR (Turbopack) může register() zavolat
// víckrát, což by vytvořilo duplicitní provider/context manager.
const globalForOtel = globalThis as unknown as {
  __kecaloOtelRegistered?: boolean;
};

/**
 * Next.js instrumentation hook — spustí se jednou při startu serveru.
 * Registruje OTel provider s Langfuse span processorem. Pokud Langfuse klíče chybí
 * nebo registrace selže, app pokračuje bez observability (graceful degradace).
 */
export function register(): void {
  // Edge runtime OTel SDK nepodporuje — instrumentujeme jen Node.js runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (globalForOtel.__kecaloOtelRegistered) return;

  if (!langfuseEnabled || !langfuseSpanProcessor) {
    console.warn(
      "[telemetry] Langfuse klíče chybí — observabilita je vypnutá (app běží normálně)."
    );
    return;
  }

  try {
    // NodeTracerProvider.register() nastaví globální provider i AsyncLocalStorage
    // context manager (nutný, aby startActiveSpan propagoval kontext přes await).
    const provider = new NodeTracerProvider({
      spanProcessors: [langfuseSpanProcessor],
    });
    provider.register();
    globalForOtel.__kecaloOtelRegistered = true;
    console.log("[telemetry] Langfuse OTel provider zaregistrován.");
  } catch (err) {
    console.error("[telemetry] Registrace OTel selhala:", err);
  }
}
