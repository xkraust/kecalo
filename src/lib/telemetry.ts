import {
  trace,
  SpanStatusCode,
  type Span,
  type Tracer,
  type Attributes,
} from "@opentelemetry/api";
import { LangfuseSpanProcessor } from "@langfuse/otel";

/**
 * Langfuse je aktivní jen když jsou k dispozici oba klíče. Bez nich se neregistruje
 * žádný provider a všechny helpery se chovají jako no-op (app běží normálně).
 */
export const langfuseEnabled =
  !!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY;

// Runtime master vypínač telemetrie (Fáze 11). Čte ho shouldExportSpan při exportu
// každého spanu — spany se vždy vytvoří (levné), ale když je false, neexportují se do
// Langfuse. Hodnotu obnovuje settings.ts ze sloupce app_settings.telemetry_enabled
// (v getSettings() per request a okamžitě v saveSettings()).
let exportEnabled = true;

/** Zapne/vypne export traces do Langfuse za běhu (bez restartu). Volá settings.ts. */
export function setTelemetryExport(enabled: boolean): void {
  exportEnabled = enabled;
}

/**
 * Sdílený singleton span processoru — jediný zdroj pravdy. Drží se zde, aby na tutéž
 * instanci dosáhl `instrumentation.ts` (registrace provideru) i `flushTelemetry()`
 * (vyprázdnění). Vzniká jen při zapnuté Langfuse.
 */
export const langfuseSpanProcessor = langfuseEnabled
  ? new LangfuseSpanProcessor({
      // Výchozí smart-filtr Langfuse exportuje jen gen_ai spany a spany od známých LLM
      // instrumentorů — naše vlastní 'kecalo' spany by zahodil. Propustíme proto vše
      // kromě interního šumu Next.js: projdou naše spany i LLM (gen_ai) spany z AI SDK.
      shouldExportSpan: ({ otelSpan }) =>
        exportEnabled && otelSpan.instrumentationScope.name !== "next.js",
    })
  : undefined;

const TRACER_NAME = "kecalo";

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Obalí async funkci do aktivního spanu. Používá `startActiveSpan` (NE `startSpan`!),
 * aby se span stal aktivním v OTel kontextu po dobu běhu `fn` — jen tak se vnořená
 * `withSpan` volání i LLM span z AI SDK zařadí pod tento span. Span se vždy ukončí,
 * při chybě se zaznamená výjimka a chyba se přehodí dál.
 *
 * Bez Langfuse není zaregistrovaný provider, takže `getTracer()` vrací no-op tracer
 * a všechny operace na spanu jsou no-op (app běží beze změny chování).
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Attributes
): Promise<T> {
  return getTracer().startActiveSpan(name, async (span) => {
    if (attributes) span.setAttributes(attributes);
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Vyprázdní pending spany do Langfuse. Nutné v serverless / `after()` callbacích —
 * jinak se traces nemusí odeslat před zmrazením/ukončením procesu. No-op bez Langfuse.
 */
export async function flushTelemetry(): Promise<void> {
  await langfuseSpanProcessor?.forceFlush();
}
