import { supabase } from "@/lib/supabase";
import { extractText } from "./extract";
import { chunkText } from "./chunk";
import { embedBatch } from "./embed";

const INSERT_BATCH = 100;

export async function processDocument(documentId: string): Promise<void> {
  try {
    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", documentId);

    const { data: doc } = await supabase
      .from("documents")
      .select("filename, mime_type")
      .eq("id", documentId)
      .single();

    if (!doc) throw new Error("Dokument nenalezen");

    const ext = doc.filename.split(".").pop()?.toLowerCase() ?? "bin";
    const { data: blob, error: dlErr } = await supabase.storage
      .from("documents")
      .download(`${documentId}/file.${ext}`);

    if (dlErr || !blob) throw new Error(`Stažení selhalo: ${dlErr?.message}`);

    const buffer = new Uint8Array(await blob.arrayBuffer());
    const { pages } = await extractText(buffer, doc.mime_type, doc.filename);
    const chunks = chunkText(pages, documentId);

    if (chunks.length === 0) {
      throw new Error("Dokument neobsahuje žádný text");
    }

    const embeddings = await embedBatch(chunks.map((c) => c.content));

    await supabase.from("chunks").delete().eq("document_id", documentId);

    const rows = chunks.map((c, i) => ({
      document_id: c.document_id,
      chunk_index: c.chunk_index,
      page: c.page,
      content: c.content,
      embedding: JSON.stringify(embeddings[i]),
    }));

    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH);
      const { error } = await supabase.from("chunks").insert(batch);
      if (error) throw new Error(`Insert chunků selhal: ${error.message}`);
    }

    await supabase
      .from("documents")
      .update({ status: "ready", chunk_count: chunks.length })
      .eq("id", documentId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Neznámá chyba při indexaci";
    await supabase
      .from("documents")
      .update({ status: "error", error_message: message })
      .eq("id", documentId);
  }
}
