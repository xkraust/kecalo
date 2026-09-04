// Denní úklid podle retenčních lhůt (GDPR etapa B, cron ve vercel.json).
//
// POZOR na povahu routy: maže data service-role klientem, který obchází RLS.
// Nechrání ji session ani proxy vrstva (cron žádnou cookie nemá), takže jediná
// obrana je sdílený secret. Proto je autorizace jediná věc, která se tu dělá
// dřív než cokoli jiného, a chybějící secret routu vypíná (503), místo aby ji
// nechal otevřenou.
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { runRetention } from "@/lib/privacy/retention";
import { flushTelemetry } from "@/lib/telemetry";

export const maxDuration = 60;

/** Porovnání odolné vůči časovému postrannímu kanálu.
 * Přes SHA-256 otisky, protože timingSafeEqual vyžaduje shodnou délku vstupů —
 * porovnávat délky napřímo by prozradilo délku secretu. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Bez secretu by šlo o veřejnou mazací routu. Vypnout je jediná bezpečná volba.
    console.error("CRON_SECRET není nastaven — retenční cron je nedostupný.");
    return NextResponse.json(
      { error: "Retenční cron není nakonfigurován." },
      { status: 503 }
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secretMatches(token, expected)) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }

  try {
    const result = await runRetention({ performedBy: null });
    // Serverless funkce po návratu zmrzne — span by se jinak neexportoval.
    await flushTelemetry();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Retenční úklid selhal:", err);
    await flushTelemetry();
    return NextResponse.json(
      { error: "Retenční úklid selhal." },
      { status: 500 }
    );
  }
}
