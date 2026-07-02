import { supabase } from "@/lib/supabase";
import type { DocumentRecord } from "@/lib/types";
import { DocumentsPageClient } from "./client";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const { data } = await supabase
    .from("documents")
    .select(
      "id, filename, mime_type, status, error_message, chunk_count, created_at, chunking_config"
    )
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">Dokumenty</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Znalostní báze pro RAG pipeline
        </p>
      </div>
      <DocumentsPageClient
        initialDocuments={(data ?? []) as DocumentRecord[]}
      />
    </div>
  );
}
