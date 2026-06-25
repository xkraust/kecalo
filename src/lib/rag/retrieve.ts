import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { withSpan } from "@/lib/telemetry";
import { embedQuery } from "./embed";

export interface RetrievalResult {
  content: string;
  page: number | null;
  document_id: string;
  filename: string;
  similarity: number;
}

export async function retrieve(
  query: string,
  topK: number = config.topK,
  threshold: number = config.similarityThreshold
): Promise<RetrievalResult[]> {
  // embedQuery je instrumentovaný v embed.ts — span embed.query se vnoří sám.
  const queryEmbedding = await embedQuery(query);

  const data = await withSpan(
    "vector-search",
    async (span) => {
      const { data, error } = await supabase.rpc("match_chunks", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: threshold,
        match_count: topK,
      });

      if (error) throw new Error(`Retrieval selhal: ${error.message}`);

      const rows = (data ?? []) as { similarity: number }[];
      span.setAttributes({
        "search.result_count": rows.length,
        "search.top_similarity":
          rows.length > 0 ? Math.max(...rows.map((r) => r.similarity)) : 0,
      });
      return data;
    },
    {
      "search.match_threshold": threshold,
      "search.match_count": topK,
    }
  );

  return (data ?? []).map(
    (row: {
      content: string;
      page: number | null;
      document_id: string;
      filename: string;
      similarity: number;
    }) => ({
      content: row.content,
      page: row.page,
      document_id: row.document_id,
      filename: row.filename,
      similarity: row.similarity,
    })
  );
}
