"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, CheckCircle2, Mail, Phone } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge } from "@/components/LeadStatusBadge";
import type { Lead, LeadStatus } from "@/lib/types";

const dateFormat = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Delší shrnutí/poznámka se sbalí — rozklik jako v testu retrievalu. */
const COLLAPSE_LENGTH = 180;

interface Props {
  leads: Lead[];
}

export function LeadsPageClient({ leads }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function updateStatus(lead: Lead, status: LeadStatus) {
    setPendingId(lead.id);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Změna stavu se nepodařila.");
      }
      router.refresh();
    } catch {
      setError("Změna stavu se nepodařila. Zkuste to prosím znovu.");
    } finally {
      setPendingId(null);
    }
  }

  if (leads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Zatím žádné poptávky. Karta s formulářem se návštěvníkům nabízí u
        odpovědí na produktové dotazy v chatu.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Jméno</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead className="w-[38%]">Shrnutí</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead>Zpracovatel</TableHead>
              <TableHead className="text-right">Akce</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => {
              const detail = [
                lead.summary,
                lead.note ? `Poznámka: ${lead.note}` : null,
              ]
                .filter(Boolean)
                .join("\n\n");
              const isExpanded = expanded.has(lead.id);
              const isLong = detail.length > COLLAPSE_LENGTH;
              const busy = pendingId === lead.id;

              return (
                <TableRow key={lead.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {dateFormat.format(new Date(lead.created_at))}
                  </TableCell>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {lead.email && (
                        <span className="flex items-center gap-1.5 text-sm">
                          <Mail
                            size={13}
                            className="shrink-0 text-muted-foreground"
                          />
                          {lead.email}
                        </span>
                      )}
                      {lead.phone && (
                        <span className="flex items-center gap-1.5 text-sm">
                          <Phone
                            size={13}
                            className="shrink-0 text-muted-foreground"
                          />
                          {lead.phone}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {detail ? (
                      <div className="space-y-1">
                        <p className="text-sm whitespace-pre-wrap">
                          {isExpanded || !isLong
                            ? detail
                            : detail.slice(0, COLLAPSE_LENGTH) + "…"}
                        </p>
                        {isLong && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(lead.id)}
                            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none"
                          >
                            {isExpanded ? "Skrýt" : "Zobrazit vše"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <LeadStatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.assignee ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {(lead.status === "new" || lead.status === "updated") && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => updateStatus(lead, "in_progress")}
                        >
                          <UserCheck size={14} className="mr-1" />
                          Převzít
                        </Button>
                      )}
                      {lead.status !== "closed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => updateStatus(lead, "closed")}
                          className="text-muted-foreground"
                        >
                          <CheckCircle2 size={14} className="mr-1" />
                          Uzavřít
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
