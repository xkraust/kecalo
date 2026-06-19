import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
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
  const queryEmbedding = await embedQuery(query);

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: threshold,
    match_count: topK,
  });

  if (error) throw new Error(`Retrieval selhal: ${error.message}`);

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
