import { VoyageAIClient } from "voyageai";
import { config } from "@/lib/config";
import { withSpan } from "@/lib/telemetry";

const BATCH_SIZE = 128;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

const PAYMENT_METHOD_ERROR =
  "Voyage AI nemá nastavenou platební metodu — doplňte ji na " +
  "https://dash.voyageai.com/billing/payment-methods. Bez ní platí limit free tieru " +
  "(3 požadavky/min, 10 000 tokenů/min), který indexace dokumentu překračuje. " +
  "Po přidání karty zůstává 200 milionů tokenů voyage-3.5 zdarma.";

const voyage = new VoyageAIClient({ apiKey: config.voyageApiKey });

// Voyage vrací 429 i pro účet bez platební metody (limit free tieru). Tato chyba je
// trvalá — opakování nepomůže — a poznáme ji podle těla odpovědi „payment method".
function isPaymentMethodError(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes("payment method");
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isPaymentMethodError(err)) throw new Error(PAYMENT_METHOD_ERROR);
      const is429 =
        err instanceof Error && err.message.includes("429");
      if (!is429 || attempt === MAX_RETRIES - 1) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  throw new Error("Unreachable");
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await withSpan(
      "embed.batch",
      async (span) => {
        const res = await withRetry(() =>
          voyage.embed({
            input: batch,
            model: "voyage-3.5",
            inputType: "document",
          })
        );
        span.setAttribute("embed.total_tokens", res.usage?.totalTokens ?? 0);
        return res;
      },
      {
        "embed.model": "voyage-3.5",
        "embed.input_type": "document",
        "embed.batch_size": batch.length,
        "embed.batch_index": Math.floor(i / BATCH_SIZE),
        "embed.total_texts": texts.length,
      }
    );

    const embeddings =
      response.data?.map((item) => {
        if (!item.embedding) throw new Error("Voyage API nevrátila embedding");
        return item.embedding;
      }) ?? [];

    if (embeddings.length !== batch.length) {
      throw new Error(
        `Voyage vrátila ${embeddings.length} embeddingů pro ${batch.length} textů`
      );
    }

    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

export async function embedQuery(text: string): Promise<number[]> {
  const response = await withSpan(
    "embed.query",
    async (span) => {
      const res = await withRetry(() =>
        voyage.embed({
          input: text,
          model: "voyage-3.5",
          inputType: "query",
        })
      );
      span.setAttribute("embed.total_tokens", res.usage?.totalTokens ?? 0);
      return res;
    },
    {
      "embed.model": "voyage-3.5",
      "embed.input_type": "query",
      "embed.input_length": text.length,
    }
  );

  const embedding = response.data?.[0]?.embedding;
  if (!embedding) throw new Error("Voyage API nevrátila embedding pro dotaz");
  return embedding;
}
