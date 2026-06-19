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
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    const hasActive = documents.some(
      (d) => d.status === "uploaded" || d.status === "processing"
    );
    if (!hasActive) {
      setPolling(false);
      return;
    }

    setPolling(true);
    const interval = setInterval(onRefresh, 3000);
    return () => clearInterval(interval);
  }, [documents, onRefresh]);

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
              <TableCell className="font-medium">{doc.filename}</TableCell>
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
                  disabled
                  title="Smazání bude dostupné ve fázi 6"
                  className="text-muted-foreground/40 cursor-not-allowed"
                >
                  <Trash2 size={16} />
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {polling && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Aktualizuji stav…
        </p>
      )}
    </div>
  );
}
