"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/slug";
import type { AudienceWithUsage } from "@/lib/types";

export function AudiencesClient({
  audiences,
}: {
  audiences: AudienceWithUsage[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Operace se nezdařila.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Chyba připojení");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/audiences", { method: "POST", body: JSON.stringify({ label }) })) {
      setLabel("");
      setCreating(false);
    }
  }

  async function handleRename(code: string) {
    if (await call(`/api/audiences/${code}`, { method: "PATCH", body: JSON.stringify({ label: editLabel }) })) {
      setEditing(null);
    }
  }

  async function handleDelete(a: AudienceWithUsage) {
    if (!confirm(`Smazat štítek ${a.label}?`)) return;
    await call(`/api/audiences/${a.code}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md bg-[#FCEBEB] px-3 py-2 text-sm text-[#A32D2D]">
          {error}
        </p>
      )}

      {creating ? (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <Input
            placeholder="Název štítku, např. Právní oddělení"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
            required
          />
          <p className="text-xs text-muted-foreground">
            Název pište česky s diakritikou. Technický kód se odvodí sám:{" "}
            <code className="font-mono">{slugify(label) || "…"}</code> — po
            založení se už nemění, přejmenovat štítek ale půjde kdykoli.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Zakládám…" : "Založit"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreating(false)}
            >
              Zrušit
            </Button>
          </div>
        </form>
      ) : (
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nový štítek
        </Button>
      )}

      {audiences.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Zatím žádné štítky. Bez nich je každý dokument buď veřejný, nebo ho
          nevidí nikdo kromě adminů.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Název</th>
                <th className="px-4 py-2.5 font-medium">Kód</th>
                <th className="px-4 py-2.5 font-medium">Použití</th>
                <th className="px-4 py-2.5 text-right font-medium">Akce</th>
              </tr>
            </thead>
            <tbody>
              {audiences.map((a) => {
                const used = a.document_count + a.job_role_count > 0;
                return (
                  <tr key={a.code} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {editing === a.code ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="h-8"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRename(a.code)}
                            disabled={busy}
                            aria-label="Uložit název"
                            className="text-[#0F6E56]"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            aria-label="Zrušit úpravu"
                            className="text-muted-foreground"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditing(a.code);
                            setEditLabel(a.label);
                          }}
                          className="text-left hover:underline"
                          title="Přejmenovat"
                        >
                          {a.label}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {a.code}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {used
                        ? [
                            a.document_count > 0 && `${a.document_count} dok.`,
                            a.job_role_count > 0 && `${a.job_role_count} rolí`,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "nepoužitý"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || used}
                          onClick={() => handleDelete(a)}
                          title={
                            used
                              ? "Štítek se používá — nejdřív ho odeberte z dokumentů a rolí"
                              : "Smazat štítek"
                          }
                        >
                          <Trash2 size={14} /> Smazat
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
