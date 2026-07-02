"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { DocumentsTable } from "@/components/DocumentsTable";
import type { DocumentRecord } from "@/lib/types";
import type { SettingsValues } from "@/lib/settings-meta";

interface Props {
  initialDocuments: DocumentRecord[];
}

export function DocumentsPageClient({ initialDocuments }: Props) {
  const [documents, setDocuments] = useState(initialDocuments);
  // Aktuální nastavení chunkování — porovnává se s chunking_config dokumentů
  // (indikace zastaralé konfigurace). Bez něj se indikace prostě nezobrazí.
  const [settings, setSettings] = useState<SettingsValues | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then(setSettings)
      .catch(() => {});
  }, []);

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
      <DocumentsTable
        documents={documents}
        onRefresh={refresh}
        chunkingSettings={settings}
      />
    </div>
  );
}
