import { VoyageAIClient } from "voyageai";
import { config } from "@/lib/config";

const BATCH_SIZE = 128;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

const voyage = new VoyageAIClient({ apiKey: config.voyageApiKey });

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
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
    const response = await withRetry(() =>
      voyage.embed({
        input: batch,
        model: "voyage-3.5",
        inputType: "document",
      })
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
  const response = await withRetry(() =>
    voyage.embed({
      input: text,
      model: "voyage-3.5",
      inputType: "query",
    })
  );

  const embedding = response.data?.[0]?.embedding;
  if (!embedding) throw new Error("Voyage API nevrátila embedding pro dotaz");
  return embedding;
}
