"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/slug";
import type { AudienceWithUsage, JobRoleWithUsage } from "@/lib/types";

export function JobRolesClient({
  roles,
  audiences,
}: {
  roles: JobRoleWithUsage[];
  audiences: AudienceWithUsage[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
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
    const ok = await call("/api/job-roles", {
      method: "POST",
      body: JSON.stringify({ label, description }),
    });
    if (ok) {
      setLabel("");
      setDescription("");
      setCreating(false);
    }
  }

  async function toggleAudience(role: JobRoleWithUsage, code: string) {
    const next = role.audiences.includes(code)
      ? role.audiences.filter((a) => a !== code)
      : [...role.audiences, code];
    await call(`/api/job-roles/${role.code}`, {
      method: "PATCH",
      body: JSON.stringify({ audiences: next }),
    });
  }

  async function handleDelete(role: JobRoleWithUsage) {
    const warning =
      role.member_count > 0
        ? `Roli má přiřazeno ${role.member_count} uživatelů — smazáním okamžitě přijdou o její štítky a budou odhlášeni. `
        : "";
    if (!confirm(`${warning}Smazat pracovní roli ${role.label}?`)) return;
    await call(`/api/job-roles/${role.code}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md bg-[#FCEBEB] px-3 py-2 text-sm text-[#A32D2D]">
          {error}
        </p>
      )}

      {audiences.length === 0 && (
        <p className="rounded-md bg-[#FAEEDA] px-3 py-2 text-sm text-[#854F0B]">
          Nejdřív si založte štítky dokumentů — bez nich nemá pracovní role co
          sdružovat.
        </p>
      )}

      {creating ? (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <Input
            placeholder="Název role, např. Vedoucí účtárny"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
            required
          />
          <Input
            placeholder="Popis (nepovinný)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Kód se odvodí z názvu:{" "}
            <code className="font-mono">{slugify(label) || "…"}</code>. Štítky
            přiřadíte po založení.
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
          <Plus size={16} /> Nová pracovní role
        </Button>
      )}

      {roles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Zatím žádné pracovní role.
        </p>
      ) : (
        <div className="space-y-4">
          {roles.map((role) => (
            <div
              key={role.code}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium">{role.label}</h2>
                  {role.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {role.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    <code className="font-mono">{role.code}</code> ·{" "}
                    {role.member_count === 0
                      ? "zatím bez nositelů"
                      : `${role.member_count} uživatelů`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleDelete(role)}
                >
                  <Trash2 size={14} /> Smazat
                </Button>
              </div>

              {audiences.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Štítky dokumentů — změna se nositelům projeví okamžitě a
                    odhlásí je:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {audiences.map((a) => {
                      const on = role.audiences.includes(a.code);
                      return (
                        <button
                          key={a.code}
                          type="button"
                          disabled={busy}
                          onClick={() => toggleAudience(role, a.code)}
                          className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                            on
                              ? "border-primary bg-[#FAECE7] text-[#C24E29]"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {a.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
