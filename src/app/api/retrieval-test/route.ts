import { NextResponse, after } from "next/server";
import { retrieve } from "@/lib/rag/retrieve";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/require-admin";
import { withSpan, flushTelemetry } from "@/lib/telemetry";

export const maxDuration = 60;

// Stejný limit jako u chatu (oprava SEC-3) — validace vstupu i za autentizací.
const MAX_QUERY_LENGTH = 4000;

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const query =
    typeof (body as { query?: unknown } | null)?.query === "string"
      ? (body.query as string).trim()
      : "";
  if (!query) {
    return NextResponse.json({ error: "Dotaz je povinný" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: "Dotaz je příliš dlouhý (max 4 000 znaků)." },
      { status: 400 }
    );
  }

  try {
    const settings = await getSettings();
    // vector-search span z retrieve() se vnoří automaticky pod retrieval-test.
    const results = await withSpan(
      "retrieval-test",
      async (span) => {
        const r = await retrieve(
          query,
          settings.topK,
          settings.similarityThreshold
        );
        span.setAttribute("test.result_count", r.length);
        return r;
      },
      { "test.query_length": query.length }
    );
    return NextResponse.json(results);
  } catch (err) {
    console.error("Test retrievalu selhal:", err);
    return NextResponse.json(
      { error: "Test retrievalu se nezdařil. Zkuste to prosím za chvíli." },
      { status: 500 }
    );
  } finally {
    after(() => flushTelemetry());
  }
}
