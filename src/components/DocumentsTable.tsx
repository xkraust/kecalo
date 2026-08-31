"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import type { AudienceWithUsage } from "@/lib/types";
import type { DocumentRecord } from "@/lib/types";
import { isChunkingStale, type SettingsValues } from "@/lib/settings-meta";

const dateFormat = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

interface DocumentsTableProps {
  documents: DocumentRecord[];
  onRefresh: () => void;
  /** Aktuální nastavení chunkování — pro indikaci zastaralé konfigurace (null = nezjišťovat). */
  chunkingSettings?: SettingsValues | null;
  /** Číselník štítků dokumentů (etapa C); prázdný = sekce viditelnosti se nezobrazí. */
  audiences?: AudienceWithUsage[];
  /** Smí uživatel přepnout dokument na `public`? (jen admin) */
  canPublish?: boolean;
}

export function DocumentsTable({
  documents,
  onRefresh,
  chunkingSettings,
  audiences = [],
  canPublish = false,
}: DocumentsTableProps) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [visibilityError, setVisibilityError] = useState("");

  async function patchDocument(doc: DocumentRecord, body: Record<string, unknown>) {
    setSavingId(doc.id);
    setVisibilityError("");
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVisibilityError(data.error ?? "Uložení se nezdařilo.");
      }
      onRefresh();
    } catch {
      setVisibilityError("Chyba připojení");
    } finally {
      setSavingId(null);
    }
  }
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  // Polling je odvozený stav — běží, jen když je nějaký dokument rozpracovaný.
  const hasActive = documents.some(
    (d) => d.status === "uploaded" || d.status === "processing"
  );

  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(onRefresh, 3000);
    return () => clearInterval(interval);
  }, [hasActive, onRefresh]);

  async function handleReprocess(doc: DocumentRecord) {
    setReprocessingId(doc.id);
    try {
      await fetch(`/api/documents/${doc.id}/reprocess`, { method: "POST" });
      onRefresh();
    } catch {
      // stav se srovná při dalším pollingu
    } finally {
      setReprocessingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/documents/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      onRefresh();
    } catch {
      // ponecháme dialog otevřený, uživatel zkusí znovu
    } finally {
      setDeleting(false);
    }
  }

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Zatím žádné dokumenty. Nahrajte první soubor výše.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {visibilityError && (
        <p className="rounded-md bg-[#FCEBEB] px-3 py-2 text-sm text-[#A32D2D]">
          {visibilityError}
        </p>
      )}
      <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dokument</TableHead>
            <TableHead>Datum</TableHead>
            <TableHead className="text-right">Chunky</TableHead>
            <TableHead>Stav</TableHead>
            {audiences.length > 0 && <TableHead>Viditelnost</TableHead>}
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => {
            const canReprocess =
              doc.status === "ready" || doc.status === "error";
            const stale =
              doc.status === "ready" &&
              !!chunkingSettings &&
              isChunkingStale(doc.chunking_config, chunkingSettings);
            return (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">
                  {doc.filename}
                  {doc.status === "error" && doc.error_message && (
                    <p
                      className="text-xs font-normal text-destructive mt-0.5 line-clamp-2 max-w-xs"
                      title={doc.error_message}
                    >
                      {doc.error_message.length > 80
                        ? doc.error_message.slice(0, 80) + "…"
                        : doc.error_message}
                    </p>
                  )}
                  {stale && (
                    <p className="text-xs font-normal text-[#854F0B] mt-0.5">
                      Zastaralá konfigurace chunkování — reindexujte
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {dateFormat.format(new Date(doc.created_at))}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {doc.chunk_count}
                </TableCell>
                <TableCell>
                  <StatusBadge status={doc.status} />
                </TableCell>
                {audiences.length > 0 && (
                  <TableCell>
                    <div className="space-y-1.5">
                      <select
                        value={doc.visibility ?? "public"}
                        disabled={savingId === doc.id}
                        onChange={(e) =>
                          patchDocument(doc, { visibility: e.target.value })
                        }
                        aria-label={`Viditelnost dokumentu ${doc.filename}`}
                        className="rounded-md border border-border bg-transparent px-2 py-1 text-xs"
                      >
                        <option value="public" disabled={!canPublish}>
                          Veřejný
                        </option>
                        <option value="restricted">Omezený</option>
                      </select>
                      {doc.visibility === "restricted" && (
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {audiences.map((a) => {
                            const on = (doc.document_audiences ?? []).some(
                              (d) => d.audience_code === a.code
                            );
                            return (
                              <button
                                key={a.code}
                                type="button"
                                disabled={savingId === doc.id}
                                onClick={() =>
                                  patchDocument(doc, {
                                    audiences: on
                                      ? (doc.document_audiences ?? [])
                                          .map((d) => d.audience_code)
                                          .filter((c) => c !== a.code)
                                      : [
                                          ...(doc.document_audiences ?? []).map(
                                            (d) => d.audience_code
                                          ),
                                          a.code,
                                        ],
                                  })
                                }
                                className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
                                  on
                                    ? "border-primary bg-[#FAECE7] text-[#C24E29]"
                                    : "border-border text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                {a.label}
                              </button>
                            );
                          })}
                          {(doc.document_audiences ?? []).length === 0 && (
                            <span className="text-[11px] text-[#854F0B]">
                              bez štítků — nevidí ho nikdo kromě adminů
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    {canReprocess && (
                      <button
                        onClick={() => handleReprocess(doc)}
                        disabled={reprocessingId === doc.id}
                        title="Reindexovat dokument (bez opětovného nahrání)"
                        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        <RefreshCw
                          size={16}
                          className={
                            reprocessingId === doc.id ? "animate-spin" : ""
                          }
                        />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(doc)}
                      title="Smazat dokument"
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {hasActive && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Aktualizuji stav…
        </p>
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat dokument</DialogTitle>
            <DialogDescription>
              Opravdu smazat dokument „{deleteTarget?.filename}&ldquo;? Tato akce je
              nevratná — odstraní se i všechny indexované chunky.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Mažu…" : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
