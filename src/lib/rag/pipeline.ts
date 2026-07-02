import { SpanStatusCode } from "@opentelemetry/api";
import { supabase } from "@/lib/supabase";
import { getSettings } from "@/lib/settings";
import { chunkingConfigOf } from "@/lib/settings-meta";
import { getTracer, withSpan, flushTelemetry } from "@/lib/telemetry";
import { extractText } from "./extract";
import { cleanPages } from "./clean";
import { chunkText } from "./chunk";
import { embedBatch } from "./embed";

const INSERT_BATCH = 100;

export async function processDocument(documentId: string): Promise<void> {
  // Rodičovský span řídíme ručně: interní try/catch chyby polyká (zapíše status=error
  // do DB), span ale chceme nechat odrážet úspěch/selhání. Běží v after() kontextu,
  // proto flush v finally.
  await getTracer().startActiveSpan("document.process", async (span) => {
    span.setAttribute("document.id", documentId);
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

      span.setAttributes({
        "document.filename": doc.filename,
        "document.mime_type": doc.mime_type,
      });

      const ext = doc.filename.split(".").pop()?.toLowerCase() ?? "bin";
      const blob = await withSpan("document.download", async () => {
        const { data: blob, error: dlErr } = await supabase.storage
          .from("documents")
          .download(`${documentId}/file.${ext}`);
        if (dlErr || !blob) throw new Error(`Stažení selhalo: ${dlErr?.message}`);
        return blob;
      });

      // Runtime parametry chunkování (fáze 13) — mimochodem obnoví i flag telemetrie.
      const settings = await getSettings();

      const buffer = new Uint8Array(await blob.arrayBuffer());
      const { pages } = await withSpan("document.extract", async (s) => {
        const result = await extractText(buffer, doc.mime_type, doc.filename);
        s.setAttribute("extract.page_count", result.pages.length);
        return result;
      });

      const cleaned = await withSpan("document.clean", async (s) => {
        const result = cleanPages(pages, {
          stripHeaders: settings.chunkStripHeaders,
        });
        s.setAttributes({
          "clean.chars_before": pages.reduce((a, p) => a + p.text.length, 0),
          "clean.chars_after": result.reduce((a, p) => a + p.text.length, 0),
          "clean.strip_headers": settings.chunkStripHeaders,
        });
        return result;
      });

      const docTitle = doc.filename.replace(/\.[^.]+$/, "");
      const chunks = await withSpan("document.chunk", async (s) => {
        const c = chunkText(cleaned, documentId, docTitle, {
          targetSize: settings.chunkTargetSize,
          breadcrumb: settings.chunkBreadcrumb,
        });
        s.setAttributes({
          "chunk.count": c.length,
          "chunk.target_size": settings.chunkTargetSize,
          "chunk.breadcrumb": settings.chunkBreadcrumb,
        });
        return c;
      });

      if (chunks.length === 0) {
        throw new Error("Dokument neobsahuje žádný text");
      }

      const embeddings = await withSpan(
        "document.embed-batch",
        async () => embedBatch(chunks.map((c) => c.content)),
        { "embed.total_texts": chunks.length }
      );

      await supabase.from("chunks").delete().eq("document_id", documentId);

      const rows = chunks.map((c, i) => ({
        document_id: c.document_id,
        chunk_index: c.chunk_index,
        page: c.page,
        section_path: c.section_path,
        content: c.content,
        embedding: JSON.stringify(embeddings[i]),
      }));

      await withSpan("document.insert-chunks", async (s) => {
        let batchCount = 0;
        for (let i = 0; i < rows.length; i += INSERT_BATCH) {
          const batch = rows.slice(i, i + INSERT_BATCH);
          const { error } = await supabase.from("chunks").insert(batch);
          if (error) throw new Error(`Insert chunků selhal: ${error.message}`);
          batchCount++;
        }
        s.setAttribute("insert.batch_count", batchCount);
      });

      await supabase
        .from("documents")
        .update({
          status: "ready",
          chunk_count: chunks.length,
          // otisk konfigurace pro detekci zastaralého chunkování v tabulce dokumentů
          chunking_config: chunkingConfigOf(settings),
        })
        .eq("id", documentId);

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Neznámá chyba při indexaci";
      await supabase
        .from("documents")
        .update({ status: "error", error_message: message })
        .eq("id", documentId);
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
    } finally {
      span.end();
      await flushTelemetry();
    }
  });
}
