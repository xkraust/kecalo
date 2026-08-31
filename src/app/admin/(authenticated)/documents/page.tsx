import { supabase } from "@/lib/supabase";
import type { AudienceWithUsage, DocumentRecord } from "@/lib/types";
import { getSessionUser } from "@/lib/session-user";
import { DocumentsPageClient } from "./client";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const me = await getSessionUser();
  const [docs, audiences] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, filename, mime_type, status, error_message, chunk_count, created_at, chunking_config, visibility, document_audiences(audience_code)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("audiences").select("code, label, created_at").order("label"),
  ]);
  const data = docs.data;

  const audienceList: AudienceWithUsage[] = (audiences.data ?? []).map((a) => ({
    code: a.code,
    label: a.label,
    created_at: a.created_at,
    document_count: 0,
    job_role_count: 0,
  }));

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
        audiences={audienceList}
        canPublish={me?.appRole === "admin"}
      />
    </div>
  );
}
