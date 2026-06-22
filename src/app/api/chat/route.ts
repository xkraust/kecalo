import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { retrieve } from "@/lib/rag/retrieve";
import {
  SYSTEM_PROMPT,
  FALLBACK_MESSAGE,
  buildContextBlock,
} from "@/lib/rag/prompts";

export const maxDuration = 60;

const MAX_HISTORY = 8;

interface ChatMessage {
  role: string;
  content: string;
}

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages: ChatMessage[] };

  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  if (!lastUserMessage?.content) {
    return new Response("Chybí dotaz uživatele", { status: 400 });
  }

  const query = lastUserMessage.content;

  const settings = await getSettings();

  let chunks;
  try {
    chunks = await retrieve(query, settings.topK, settings.similarityThreshold);
  } catch (err) {
    console.error("Retrieval selhal:", err);
    return NextResponse.json(
      {
        error:
          "Omlouváme se, služba je dočasně nedostupná. Zkuste to prosím za chvíli.",
      },
      { status: 503 }
    );
  }

  if (chunks.length === 0) {
    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      messages: [{ role: "user" as const, content: query }],
      system:
        "Odpověz přesně touto zprávou, nic jiného nepřidávej: " +
        FALLBACK_MESSAGE,
      temperature: 0,
      maxOutputTokens: 300,
      onError({ error }) {
        console.error("Claude stream (fallback) selhal:", error);
      },
    });

    return result.toTextStreamResponse({
      headers: { "X-Sources": encodeURIComponent(JSON.stringify([])) },
    });
  }

  const contextBlock = buildContextBlock(chunks);
  const systemWithContext = `${SYSTEM_PROMPT}\n\n<context>\n${contextBlock}\n</context>`;

  const trimmedMessages = messages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const sources = chunks.map((c) => ({
    filename: c.filename,
    page: c.page,
    similarity: Math.round(c.similarity * 100) / 100,
  }));

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemWithContext,
    messages: trimmedMessages,
    temperature: settings.llmTemperature,
    maxOutputTokens: 1500,
    onError({ error }) {
      console.error("Claude stream selhal:", error);
    },
  });

  return result.toTextStreamResponse({
    headers: { "X-Sources": encodeURIComponent(JSON.stringify(sources)) },
  });
}
