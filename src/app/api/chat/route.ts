import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { NextResponse, after } from "next/server";
import { SpanStatusCode } from "@opentelemetry/api";
import { config } from "@/lib/config";
import { getSettings } from "@/lib/settings";
import { createRateLimiter, clientIp } from "@/lib/rate-limit";
import { retrieve, type RetrievalResult } from "@/lib/rag/retrieve";
import { getTracer, withSpan, flushTelemetry } from "@/lib/telemetry";
import {
  SYSTEM_PROMPT,
  FALLBACK_MESSAGE,
  buildContextBlock,
} from "@/lib/rag/prompts";

export const maxDuration = 60;

const MAX_HISTORY = 8;
/** Limit délky jedné zprávy — ochrana proti obřím promptům (náklady LLM). */
const MAX_MESSAGE_LENGTH = 4000;
/** Limit počtu zpráv v požadavku (historie se pak stejně ořezává na MAX_HISTORY). */
const MAX_MESSAGES = 50;

const chatLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Metadata zdrojů jdou v HTTP hlavičce X-Sources, která má limit velikosti
 * (Vercel ~16 KB na všechny hlavičky). Dlouhé hodnoty se ořezávají a při
 * překročení pojistky se vynechají cesty sekcí (filename + strana stačí).
 */
const MAX_SOURCES_HEADER = 8000;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function buildSourcesHeader(chunks: RetrievalResult[]): string {
  const sources = chunks.map((c) => ({
    filename: truncate(c.filename, 80),
    page: c.page,
    section: c.section_path ? truncate(c.section_path, 100) : null,
    similarity: Math.round(c.similarity * 100) / 100,
  }));
  const encoded = encodeURIComponent(JSON.stringify(sources));
  if (encoded.length <= MAX_SOURCES_HEADER) return encoded;
  return encodeURIComponent(
    JSON.stringify(sources.map((s) => ({ ...s, section: null })))
  );
}

/** Validace těla požadavku — vrací zprávy, nebo null při nevalidním vstupu. */
function parseMessages(body: unknown): ChatMessage[] | null {
  if (!body || typeof body !== "object") return null;
  const messages = (body as { messages?: unknown }).messages;
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES
  ) {
    return null;
  }

  const result: ChatMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length > MAX_MESSAGE_LENGTH) {
      return null;
    }
    result.push({ role, content });
  }
  return result;
}

export async function POST(request: Request) {
  if (!chatLimiter(clientIp(request))) {
    return NextResponse.json(
      { error: "Příliš mnoho dotazů. Zkuste to prosím za chvíli." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const messages = parseMessages(body);
  if (!messages) {
    return NextResponse.json(
      {
        error:
          "Neplatný vstup — očekávám pole zpráv s rolí user/assistant a textem do 4 000 znaků.",
      },
      { status: 400 }
    );
  }

  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  if (!lastUserMessage?.content) {
    return NextResponse.json(
      { error: "Chybí dotaz uživatele" },
      { status: 400 }
    );
  }

  const query = lastUserMessage.content;

  const settings = await getSettings();

  // Rodičovský span držíme otevřený přes celý request. Kvůli streamování ho NEukončíme
  // při návratu Response, ale až v onFinish/onError streamu — jinak by latence nezahrnula
  // generování a LLM span od AI SDK by skončil až po rodiči (osiřelý span).
  return getTracer().startActiveSpan("chat-pipeline", async (span) => {
    span.setAttributes({
      "chat.message_count": messages.length,
      "chat.query_length": query.length,
    });

    // Jednorázové ukončení spanu — onFinish a onError se navzájem vylučují, guard je
    // pojistka proti dvojímu end().
    let spanEnded = false;
    const endSpan = (ok: boolean, err?: unknown) => {
      if (spanEnded) return;
      spanEnded = true;
      if (err) span.recordException(err as Error);
      span.setStatus({ code: ok ? SpanStatusCode.OK : SpanStatusCode.ERROR });
      span.end();
    };

    let chunks;
    try {
      chunks = await withSpan("retrieval", async (rspan) => {
        const result = await retrieve(
          query,
          settings.topK,
          settings.similarityThreshold
        );
        const topSimilarity =
          result.length > 0 ? Math.max(...result.map((c) => c.similarity)) : 0;
        rspan.setAttributes({
          "retrieval.chunk_count": result.length,
          "retrieval.top_similarity": topSimilarity,
          "retrieval.is_fallback": result.length === 0,
        });
        return result;
      });
    } catch (err) {
      console.error("Retrieval selhal:", err);
      endSpan(false, err);
      return NextResponse.json(
        {
          error:
            "Omlouváme se, služba je dočasně nedostupná. Zkuste to prosím za chvíli.",
        },
        { status: 503 }
      );
    }

    if (chunks.length === 0) {
      // Oprava B3: fallback je statický text — volat Claude jen kvůli doslovnému
      // opsání FALLBACK_MESSAGE stálo latenci a tokeny a riskovalo nepřesnou
      // reprodukci. Klient čte tělo streamem, prostý text mu nevadí.
      span.setAttribute("retrieval.is_fallback", true);
      endSpan(true);
      after(() => flushTelemetry());

      return new Response(FALLBACK_MESSAGE, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Sources": encodeURIComponent(JSON.stringify([])),
        },
      });
    }

    const contextBlock = buildContextBlock(chunks);
    // Runtime override z /admin/parameters/prompts; null = výchozí z kódu (Fáze 17).
    const systemPrompt = settings.systemPrompt ?? SYSTEM_PROMPT;
    const systemWithContext = `${systemPrompt}\n\n<context>\n${contextBlock}\n</context>`;

    const trimmedMessages = messages.slice(-MAX_HISTORY);

    const sourcesHeader = buildSourcesHeader(chunks);

    const result = streamText({
      model: anthropic(config.chatModel),
      system: systemWithContext,
      messages: trimmedMessages,
      temperature: settings.llmTemperature,
      maxOutputTokens: 1500,
      // Odpojení klienta (zavřená záložka, abort z useChat) se propaguje jako abort
      // streamu — bez toho by generování běželo dál a span by zůstal neukončený.
      abortSignal: request.signal,
      experimental_telemetry: {
        isEnabled: settings.telemetryEnabled,
        functionId: "chat-rag",
        // Obsah dotazů/odpovědí jen když je zapnut runtime přepínač (Fáze 11).
        recordInputs: settings.recordContent,
        recordOutputs: settings.recordContent,
        metadata: {
          topK: settings.topK,
          similarityThreshold: settings.similarityThreshold,
          llmTemperature: settings.llmTemperature,
          chunkCount: chunks.length,
        },
      },
      onError({ error }) {
        console.error("Claude stream selhal:", error);
        endSpan(false, error);
      },
      // Při abortu se nevolá onFinish ani onError — bez tohoto callbacku by span
      // zůstal neukončený a trace by se (v immediate režimu) neexportovala.
      onAbort() {
        span.setAttribute("chat.aborted", true);
        endSpan(true);
      },
      onFinish({ usage }) {
        span.setAttributes({
          "llm.input_tokens": usage?.inputTokens ?? 0,
          "llm.output_tokens": usage?.outputTokens ?? 0,
        });
        endSpan(true);
      },
    });

    after(() => flushTelemetry());

    return result.toTextStreamResponse({
      headers: { "X-Sources": sourcesHeader },
    });
  });
}
