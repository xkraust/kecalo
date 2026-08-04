import { LangfuseClient } from "@langfuse/client";
import { langfuseEnabled } from "@/lib/telemetry";

/**
 * Zápis skóre do Langfuse (uživatelská zpětná vazba).
 *
 * Odděleno od `telemetry.ts` schválně: ten je čistě o OpenTelemetry a importuje ho
 * i `instrumentation.ts` při startu — tenhle modul sahá na Langfuse REST klienta
 * a načítá se jen v routě, která skóre opravdu posílá.
 */

/**
 * Klient se vytváří líně při prvním použití. Klíče čte z prostředí sám
 * (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL).
 */
let client: LangfuseClient | undefined;

function getClient(): LangfuseClient | undefined {
  if (!langfuseEnabled) return undefined;
  if (!client) client = new LangfuseClient();
  return client;
}

/** Jméno skóre pro palec nahoru/dolů. Jedno napříč celou aplikací. */
const USER_THUMBS_SCORE = "user-thumbs";

/**
 * Připne hlas uživatele na trace jako skóre `user-thumbs` (1 = nahoru, 0 = dolů).
 *
 * **Fail-open:** chyba se jen zaloguje. Zpětná vazba je už v tu chvíli uložená
 * v Supabase a výpadek Langfuse nesmí uživateli shodit odpověď na hodnocení.
 *
 * Idempotence přes deterministické `id` (session + index zprávy) — přehlasování
 * téže odpovědi skóre přepíše místo zakládání duplicit, stejně jako upsert v DB.
 */
export async function recordUserThumbs(params: {
  traceId: string;
  sessionId: string;
  messageIndex: number;
  rating: "up" | "down";
}): Promise<void> {
  const langfuse = getClient();
  if (!langfuse) return;

  try {
    langfuse.score.create({
      id: `thumbs:${params.sessionId}:${params.messageIndex}`,
      traceId: params.traceId,
      name: USER_THUMBS_SCORE,
      value: params.rating === "up" ? 1 : 0,
      // Bez explicitního dataType by se 1/0 uložila jako NUMERIC.
      dataType: "BOOLEAN",
    });
    await langfuse.flush();
  } catch (err) {
    console.error("Zápis skóre do Langfuse selhal:", err);
  }
}
