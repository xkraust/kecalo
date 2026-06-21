"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
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
import type { DocumentRecord } from "@/lib/types";

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
}

export function DocumentsTable({ documents, onRefresh }: DocumentsTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Polling je odvozený stav — běží, jen když je nějaký dokument rozpracovaný.
  const hasActive = documents.some(
    (d) => d.status === "uploaded" || d.status === "processing"
  );

  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(onRefresh, 3000);
    return () => clearInterval(interval);
  }, [hasActive, onRefresh]);

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
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dokument</TableHead>
            <TableHead>Datum</TableHead>
            <TableHead className="text-right">Chunky</TableHead>
            <TableHead>Stav</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
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
              <TableCell>
                <button
                  onClick={() => setDeleteTarget(doc)}
                  title="Smazat dokument"
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </TableCell>
            </TableRow>
          ))}
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
  );
}
