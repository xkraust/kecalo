"use client";

import { useCallback, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { DocumentsTable } from "@/components/DocumentsTable";
import type { DocumentRecord } from "@/lib/types";

interface Props {
  initialDocuments: DocumentRecord[];
}

export function DocumentsPageClient({ initialDocuments }: Props) {
  const [documents, setDocuments] = useState(initialDocuments);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch {
      // silently retry on next poll
    }
  }, []);

  return (
    <div className="space-y-6">
      <UploadZone onUploadComplete={refresh} />
      <DocumentsTable documents={documents} onRefresh={refresh} />
    </div>
  );
}
