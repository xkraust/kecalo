"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppRoleBadge } from "@/components/AppRoleBadge";
import type { AdminUser, JobRoleWithUsage } from "@/lib/types";
import type { AppRole } from "@/lib/session-user";
import { fullName } from "@/lib/validation";

const ROLE_OPTIONS: { value: AppRole; label: string; hint: string }[] = [
  { value: "viewer", label: "Čtenář", hint: "Vidí dokumenty a test retrievalu" },
  { value: "editor", label: "Editor", hint: "Spravuje dokumenty a poptávky" },
  {
    value: "admin",
    label: "Admin",
    hint: "Plná správa včetně parametrů a uživatelů",
  },
];

export function UsersPageClient({
  users,
  currentUserId,
  jobRoles,
  rolesByUser,
  audiencesByUser,
}: {
  users: AdminUser[];
  currentUserId: string;
  jobRoles: JobRoleWithUsage[];
  rolesByUser: Record<string, string[]>;
  audiencesByUser: Record<string, { code: string; via: string }[]>;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [appRole, setAppRole] = useState<AppRole>("viewer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Vygenerované heslo se zobrazí jednou — v DB je jen hash, znovu ho nikdo
  // nezjistí. Proto ho držíme, dokud ho admin sám nezavře.
  const [issued, setIssued] = useState<{
    username: string;
    password: string;
  } | null>(null);

  async function call(
    url: string,
    init: RequestInit
  ): Promise<Record<string, unknown> | null> {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Operace se nezdařila.");
        return null;
      }
      router.refresh();
      return data as Record<string, unknown>;
    } catch {
      setError("Chyba připojení");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const data = await call("/api/users", {
      method: "POST",
      body: JSON.stringify({ firstName, lastName, email, appRole }),
    });
    if (data?.password) {
      setIssued({
        username: `${firstName} ${lastName} (${email})`,
        password: data.password as string,
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setAppRole("viewer");
      setCreating(false);
    }
  }

  async function handleReset(user: AdminUser) {
    const ok = confirm(
      `Vygenerovat nové heslo pro uživatele ${fullName(user.first_name, user.last_name, user.email)}? Stávající přestane platit a uživatel bude odhlášen.`
    );
    if (!ok) return;
    const data = await call(`/api/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ resetPassword: true }),
    });
    if (data?.password) {
      setIssued({
        username: fullName(user.first_name, user.last_name, user.email),
        password: data.password as string,
      });
    }
  }

  async function handleRole(user: AdminUser, role: AppRole) {
    await call(`/api/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ appRole: role }),
    });
  }

  async function toggleJobRole(user: AdminUser, code: string) {
    const current = rolesByUser[user.id] ?? [];
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
    await call(`/api/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ jobRoles: next }),
    });
  }

  async function handleActive(user: AdminUser) {
    const verb = user.is_active ? "Deaktivovat" : "Aktivovat";
    if (!confirm(`${verb} uživatele ${fullName(user.first_name, user.last_name, user.email)}?`))
      return;
    await call(`/api/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !user.is_active }),
    });
  }

  return (
    <div className="space-y-6">
      {issued && (
        <div className="rounded-lg border border-[#D85A30]/30 bg-[#FAECE7] p-4">
          <p className="text-sm font-medium text-[#C24E29]">
            Heslo pro uživatele {issued.username} — zobrazuje se jen teď
          </p>
          <p className="mt-1 text-sm text-[#854F0B]">
            Předejte ho uživateli. Při prvním přihlášení si bude muset zvolit
            vlastní. Znovu už heslo nikdo nezjistí — v databázi je jen otisk.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-md bg-white px-3 py-2 font-mono text-sm">
              {issued.password}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard?.writeText(issued.password)}
            >
              <Copy size={14} /> Kopírovat
            </Button>
            <Button size="sm" onClick={() => setIssued(null)}>
              Hotovo
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-[#FCEBEB] px-3 py-2 text-sm text-[#A32D2D]">
          {error}
        </p>
      )}

      {creating ? (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex gap-3">
            <Input
              placeholder="Jméno"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
              required
            />
            <Input
              placeholder="Příjmení"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
          <Input
            type="email"
            placeholder="E-mail (slouží i jako přihlašovací jméno)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setAppRole(o.value)}
                title={o.hint}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  appRole === o.value
                    ? "border-primary bg-[#FAECE7] text-[#C24E29]"
                    : "border-border hover:bg-muted"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {ROLE_OPTIONS.find((o) => o.value === appRole)?.hint}. Heslo
            vygeneruje aplikace a zobrazí se po založení.
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
          <UserPlus size={16} /> Nový uživatel
        </Button>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Uživatel</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Pracovní role</th>
              <th className="px-4 py-2.5 font-medium">Stav</th>
              <th className="px-4 py-2.5 text-right font-medium">Akce</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span
                    className={
                      u.is_active ? "" : "text-muted-foreground line-through"
                    }
                  >
                    {fullName(u.first_name, u.last_name, u.email)}
                  </span>
                  {u.id === currentUserId && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (vy)
                    </span>
                  )}
                  {u.must_change_password && (
                    <span className="ml-2 text-xs text-[#854F0B]">
                      čeká na změnu hesla
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  {u.auth_provider === "oidc" && (
                    <p className="text-xs text-muted-foreground">
                      účet z firemního přihlášení
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.app_role}
                    disabled={busy}
                    onChange={(e) => handleRole(u, e.target.value as AppRole)}
                    className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
                    aria-label={`Role uživatele ${fullName(u.first_name, u.last_name, u.email)}`}
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {u.auth_provider === "oidc" ? (
                    // IdP je zdroj pravdy: každé přihlášení přepíše role podle
                    // skupin, takže ruční změna by se tiše ztratila.
                    <div className="max-w-[280px]">
                      <div className="flex flex-wrap gap-1">
                        {(rolesByUser[u.id] ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            žádné role ze skupin
                          </span>
                        ) : (
                          jobRoles
                            .filter((r) => (rolesByUser[u.id] ?? []).includes(r.code))
                            .map((r) => (
                              <span
                                key={r.code}
                                className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
                              >
                                {r.label}
                              </span>
                            ))
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        spravuje se přes skupiny v IdP
                      </p>
                    </div>
                  ) : jobRoles.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      žádné role
                    </span>
                  ) : (
                    <div className="flex max-w-[280px] flex-wrap gap-1">
                      {jobRoles.map((r) => {
                        const on = (rolesByUser[u.id] ?? []).includes(r.code);
                        return (
                          <button
                            key={r.code}
                            type="button"
                            disabled={busy}
                            onClick={() => toggleJobRole(u, r.code)}
                            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                              on
                                ? "border-primary bg-[#FAECE7] text-[#C24E29]"
                                : "border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {(audiencesByUser[u.id] ?? []).length > 0 && (
                    <p className="mt-1 max-w-[280px] text-xs text-muted-foreground">
                      vidí:{" "}
                      {[
                        ...new Set(
                          (audiencesByUser[u.id] ?? []).map((a) => a.code)
                        ),
                      ].join(", ")}
                    </p>
                  )}
                  {u.app_role === "admin" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      admin vidí vše bez ohledu na štítky
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.is_active ? (
                    <AppRoleBadge role={u.app_role} />
                  ) : (
                    <span className="rounded-md bg-[#F1EFE8] px-2.5 py-0.5 text-xs font-medium text-[#5F5E5A]">
                      Deaktivovaný
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {u.auth_provider === "local" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleReset(u)}
                        title="Vygenerovat nové heslo"
                      >
                        <KeyRound size={14} /> Reset hesla
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleActive(u)}
                    >
                      {u.is_active ? "Deaktivovat" : "Aktivovat"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
