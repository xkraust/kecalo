"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  RETENTION_SLIDER_FIELDS,
  RETENTION_TOGGLE_FIELDS,
  LEAD_CAPTURE_FIELDS,
  clampField,
  type SettingsValues,
  type RetentionNumericKey,
} from "@/lib/settings-meta";
import type { Lead } from "@/lib/types";

export interface PrivacyAction {
  id: string;
  kind: "retention" | "erasure";
  subject_hash: string | null;
  leads_deleted: number;
  feedback_deleted: number;
  created_at: string;
}

interface SubjectFeedback {
  id: string;
  session_id: string;
  message_index: number;
  rating: "up" | "down";
  query: string | null;
  processing_basis: string;
  created_at: string;
}

interface SubjectData {
  contact: { kind: "email" | "phone"; value: string };
  leads: Lead[];
  feedback: SubjectFeedback[];
  sessionIds: string[];
}

interface Props {
  initial: SettingsValues;
  actions: PrivacyAction[];
}

const dateFmt = new Intl.DateTimeFormat("cs-CZ", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** Právní titul lidsky. Obsluha musí vidět, pod jakým titulem záznam vznikl,
 * ještě než ho vydá nebo smaže — po pozdější změně konfigurace už by to
 * z nastavení nešlo odvodit. */
function basisLabel(basis: string): string {
  if (basis === "souhlas") return "Souhlas";
  if (basis === "opravneny_zajem") return "Oprávněný zájem";
  return basis;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function PrivacyClient({ initial, actions }: Props) {
  const router = useRouter();

  // --- Retenční parametry ---------------------------------------------------
  const [values, setValues] = useState({
    retentionEnabled: initial.retentionEnabled,
    retentionLeadsMonths: initial.retentionLeadsMonths,
    retentionFeedbackMonths: initial.retentionFeedbackMonths,
    leadCaptureEnabled: initial.leadCaptureEnabled,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");

  async function saveRetention() {
    setSavingSettings(true);
    setSettingsStatus("");
    try {
      const res = await fetch("/api/privacy/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chyba");
      setSettingsStatus("Uloženo.");
      router.refresh();
    } catch (err) {
      setSettingsStatus(err instanceof Error ? err.message : "Uložení selhalo.");
    } finally {
      setSavingSettings(false);
    }
  }

  // --- Ruční úklid ----------------------------------------------------------
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState("");

  async function runCleanup() {
    if (
      !confirm(
        "Spustit úklid teď? Smaže poptávky a zpětnou vazbu starší než nastavené lhůty. Akce je nevratná."
      )
    ) {
      return;
    }
    setCleaning(true);
    setCleanupResult("");
    try {
      const res = await fetch("/api/privacy/retention", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chyba");
      setCleanupResult(
        data.skipped
          ? "Retence je vypnutá — nic se nemazalo."
          : `Smazáno: ${data.leadsDeleted} poptávek, ${data.feedbackDeleted} hlasů.`
      );
      router.refresh();
    } catch (err) {
      setCleanupResult(err instanceof Error ? err.message : "Úklid selhal.");
    } finally {
      setCleaning(false);
    }
  }

  // --- Subjekt údajů --------------------------------------------------------
  const [contact, setContact] = useState("");
  const [searching, setSearching] = useState(false);
  const [subject, setSubject] = useState<SubjectData | null>(null);
  const [subjectStatus, setSubjectStatus] = useState("");
  const [erasing, setErasing] = useState(false);

  async function callSubject(action: "find" | "erase") {
    const res = await fetch("/api/privacy/subject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, contact }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Chyba");
    return data;
  }

  async function search() {
    setSearching(true);
    setSubjectStatus("");
    setSubject(null);
    try {
      setSubject(await callSubject("find"));
    } catch (err) {
      setSubjectStatus(err instanceof Error ? err.message : "Hledání selhalo.");
    } finally {
      setSearching(false);
    }
  }

  async function erase() {
    if (!subject) return;
    const total = subject.leads.length + subject.feedback.length;
    if (
      !confirm(
        `Trvale smazat ${subject.leads.length} poptávek a ${subject.feedback.length} hlasů (celkem ${total} záznamů) pro kontakt ${subject.contact.value}?\n\nAkce je NEVRATNÁ.`
      )
    ) {
      return;
    }
    setErasing(true);
    setSubjectStatus("");
    try {
      const data = await callSubject("erase");
      setSubject(null);
      setContact("");
      setSubjectStatus(
        `Smazáno: ${data.leadsDeleted} poptávek, ${data.feedbackDeleted} hlasů.`
      );
      router.refresh();
    } catch (err) {
      setSubjectStatus(err instanceof Error ? err.message : "Výmaz selhal.");
    } finally {
      setErasing(false);
    }
  }

  /** Export podle čl. 15/20 — skládá se na klientu z odpovědi hledání. */
  function downloadJson() {
    if (!subject) return;
    const blob = new Blob([JSON.stringify(subject, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `osobni-udaje-${subject.contact.value.replace(/[^a-z0-9]/gi, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function setMonths(key: RetentionNumericKey, raw: number) {
    setValues((v) => ({ ...v, [key]: clampField(key, raw) }));
  }

  return (
    <div className="space-y-10">
      {/* Retenční parametry */}
      <Section
        title="Doba uchování"
        description="Po uplynutí lhůty se záznamy trvale smažou. Úklid běží denně ve 3:00 a jde spustit i ručně."
      >
        <div className="space-y-4">
          {/* Veřejné zásady na /privacy vypisují lhůty z těchto hodnot, takže
              při vypnutém úklidu slibují mazání, které se neděje. Vazbu mezi
              slibem a mechanismem je lepší hlídat tady než ji objevit až při
              kontrole. Vychází z ULOŽENÉHO stavu, ne z rozpracovaného. */}
          {!initial.retentionEnabled && (
            <div className="rounded-md bg-[#FAEEDA] px-3 py-2 text-xs text-[#854F0B]">
              Zásady zpracování na{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                /privacy
              </a>{" "}
              uvádějí, že poptávky mažeme po{" "}
              {initial.retentionLeadsMonths} měsících a hodnocení po{" "}
              {initial.retentionFeedbackMonths} měsících. Automatický úklid je
              ale vypnutý, takže se ta doba nedodržuje.
            </div>
          )}
          {RETENTION_TOGGLE_FIELDS.map((field) => (
            <div
              key={field.key}
              className="rounded-lg border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium">{field.label}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {field.description}
                  </p>
                </div>
                <Switch
                  checked={values.retentionEnabled}
                  onCheckedChange={(checked) =>
                    setValues((v) => ({ ...v, retentionEnabled: checked }))
                  }
                />
              </div>
              {field.warning && (
                <div className="mt-3 rounded-md bg-[#FAEEDA] px-2.5 py-1.5 text-xs text-[#854F0B]">
                  {field.warning}
                </div>
              )}
            </div>
          ))}

          {RETENTION_SLIDER_FIELDS.map((field) => (
            <div
              key={field.key}
              className="rounded-lg border border-border bg-card p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium">{field.label}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {field.description}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-secondary px-2.5 py-1 text-sm font-medium tabular-nums">
                  {field.format(values[field.key])}
                </span>
              </div>
              <div className="space-y-1.5">
                <Slider
                  value={values[field.key]}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  onValueChange={(v) =>
                    setMonths(field.key, typeof v === "number" ? v : v[0])
                  }
                />
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{field.format(field.min)}</span>
                  <span>{field.format(field.max)}</span>
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveRetention} disabled={savingSettings} size="sm">
              {savingSettings ? "Ukládám…" : "Uložit"}
            </Button>
            <Button
              onClick={runCleanup}
              disabled={cleaning}
              size="sm"
              variant="outline"
            >
              {cleaning ? "Uklízím…" : "Spustit úklid teď"}
            </Button>
            {settingsStatus && (
              <span className="text-sm text-muted-foreground">
                {settingsStatus}
              </span>
            )}
            {cleanupResult && (
              <span className="text-sm text-muted-foreground">
                {cleanupResult}
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* Sběr kontaktů */}
      <Section
        title="Sběr kontaktů v chatu"
        description="Řídí, zda bot nabízí kartu poptávky. Nezávislý parametr, ne součást „režimu“ — chování spolu koreluje, ale není to táž věc."
      >
        {LEAD_CAPTURE_FIELDS.map((field) => (
          <div
            key={field.key}
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium">{field.label}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {field.description}
                </p>
              </div>
              <Switch
                checked={values.leadCaptureEnabled}
                onCheckedChange={(checked) =>
                  setValues((v) => ({ ...v, leadCaptureEnabled: checked }))
                }
              />
            </div>
            {field.warning && (
              <div className="mt-3 rounded-md bg-[#FAEEDA] px-2.5 py-1.5 text-xs text-[#854F0B]">
                {field.warning}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Uloží se tlačítkem <strong>Uložit</strong> v sekci Doba uchování.
            </p>
          </div>
        ))}
      </Section>

      {/* Subjekt údajů */}
      <Section
        title="Žádost subjektu údajů"
        description="Vyhledá poptávky podle kontaktu a přes jejich session i navázanou zpětnou vazbu. Slouží k vyřízení práva na přístup (čl. 15), přenositelnost (čl. 20) i výmaz (čl. 17)."
      >
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex gap-2">
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") search();
              }}
              placeholder="E-mail nebo telefon subjektu"
              className="max-w-sm"
            />
            <Button
              onClick={search}
              disabled={searching || !contact.trim()}
              size="sm"
            >
              {searching ? "Hledám…" : "Vyhledat"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Totožnost žadatele ověřuje obsluha mimo aplikaci. Zaměstnanecké účty
            sem nepatří — spravují se v sekci Uživatelé a mají jiný právní titul
            (plnění smlouvy, ne souhlas).
          </p>

          {subjectStatus && (
            <p className="text-sm text-muted-foreground">{subjectStatus}</p>
          )}

          {subject && (
            <div className="space-y-4 border-t border-border pt-4">
              <p className="text-sm">
                Nalezeno <strong>{subject.leads.length}</strong> poptávek a{" "}
                <strong>{subject.feedback.length}</strong> hlasů zpětné vazby
                {subject.sessionIds.length > 0 && (
                  <> ve {subject.sessionIds.length} konverzacích</>
                )}
                .
              </p>

              {subject.leads.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1.5 pr-3 font-medium">Vytvořeno</th>
                        <th className="py-1.5 pr-3 font-medium">Jméno</th>
                        <th className="py-1.5 pr-3 font-medium">Kontakt</th>
                        <th className="py-1.5 pr-3 font-medium">Typ</th>
                        <th className="py-1.5 pr-3 font-medium">Stav</th>
                        <th className="py-1.5 font-medium">Právní titul</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subject.leads.map((l) => (
                        <tr key={l.id} className="border-t border-border">
                          <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">
                            {formatDate(l.created_at)}
                          </td>
                          <td className="py-1.5 pr-3">{l.name}</td>
                          <td className="py-1.5 pr-3">
                            {l.email ?? l.phone ?? "—"}
                          </td>
                          <td className="py-1.5 pr-3">{l.type}</td>
                          <td className="py-1.5 pr-3">{l.status}</td>
                          <td className="py-1.5">{basisLabel(l.processing_basis)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {subject.feedback.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1.5 pr-3 font-medium">Vytvořeno</th>
                        <th className="py-1.5 pr-3 font-medium">Hodnocení</th>
                        <th className="py-1.5 pr-3 font-medium">Právní titul</th>
                        <th className="py-1.5 font-medium">Uložený dotaz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subject.feedback.map((f) => (
                        <tr key={f.id} className="border-t border-border">
                          <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">
                            {formatDate(f.created_at)}
                          </td>
                          <td className="py-1.5 pr-3">
                            {f.rating === "up" ? "Nahoru" : "Dolů"}
                          </td>
                          <td className="py-1.5 pr-3">
                            {basisLabel(f.processing_basis)}
                          </td>
                          <td className="py-1.5 text-muted-foreground">
                            {f.query ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={downloadJson} size="sm" variant="outline">
                  Stáhnout JSON
                </Button>
                <Button
                  onClick={erase}
                  disabled={
                    erasing ||
                    subject.leads.length + subject.feedback.length === 0
                  }
                  size="sm"
                  variant="destructive"
                >
                  {erasing ? "Mažu…" : "Trvale smazat"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Auditní historie */}
      <Section
        title="Historie úkonů"
        description="Doložitelná stopa provedených výmazů (čl. 5 odst. 2). Neobsahuje kontakty — jen klíčovaný otisk, podle kterého lze úkon dohledat."
      >
        <div className="rounded-lg border border-border bg-card p-5">
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Zatím žádný úkon neproběhl.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Kdy</th>
                    <th className="py-1.5 pr-3 font-medium">Druh</th>
                    <th className="py-1.5 pr-3 font-medium">Poptávek</th>
                    <th className="py-1.5 pr-3 font-medium">Hlasů</th>
                    <th className="py-1.5 font-medium">Otisk subjektu</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">
                        {formatDate(a.created_at)}
                      </td>
                      <td className="py-1.5 pr-3">
                        {a.kind === "retention" ? "Úklid" : "Výmaz na žádost"}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {a.leads_deleted}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {a.feedback_deleted}
                      </td>
                      <td className="py-1.5 font-mono text-xs text-muted-foreground">
                        {a.subject_hash ? a.subject_hash.slice(0, 12) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
