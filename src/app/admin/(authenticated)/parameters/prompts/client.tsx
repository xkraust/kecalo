"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SYSTEM_PROMPT, LEAD_SUMMARY_PROMPT } from "@/lib/rag/prompts";
import {
  PROMPT_FIELDS,
  type SettingsValues,
  type TextField,
  type TextSettingKey,
} from "@/lib/settings-meta";

/** Výchozí texty z kódu — zobrazují se v textarea, dokud neexistuje override. */
const DEFAULTS: Record<TextSettingKey, string> = {
  systemPrompt: SYSTEM_PROMPT,
  leadSummaryPrompt: LEAD_SUMMARY_PROMPT,
};

interface PromptCardProps {
  field: TextField;
  /** Override, nebo null = výchozí z kódu. */
  value: string | null;
  /** Karta je odemčená k editaci (ochrana proti náhodnému přepsání). */
  editing: boolean;
  disabled: boolean;
  onChange: (key: TextSettingKey, value: string | null) => void;
  onStartEdit: (key: TextSettingKey) => void;
  onCancelEdit: (key: TextSettingKey) => void;
}

function PromptCard({
  field,
  value,
  editing,
  disabled,
  onChange,
  onStartEdit,
  onCancelEdit,
}: PromptCardProps) {
  const isDefault = value === null;
  const effective = value ?? DEFAULTS[field.key];
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Po odemčení přesunout fokus do textarey.
  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{field.label}</h3>
            {isDefault ? (
              <span
                className="inline-block rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: "#F1EFE8", color: "#5F5E5A" }}
              >
                Výchozí
              </span>
            ) : (
              <span
                className="inline-block rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: "#FAECE7", color: "#D85A30" }}
              >
                Vlastní
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {field.description}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {editing ? (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onCancelEdit(field.key)}
            >
              <Lock size={14} className="mr-1" />
              Zamknout
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onStartEdit(field.key)}
            >
              <Pencil size={14} className="mr-1" />
              Upravit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !editing || isDefault}
            onClick={() => onChange(field.key, null)}
          >
            Obnovit výchozí
          </Button>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        value={effective}
        onChange={(e) => onChange(field.key, e.target.value)}
        readOnly={!editing}
        maxLength={field.maxLength}
        rows={14}
        disabled={disabled}
        aria-label={field.label}
        className={
          "w-full rounded-md border border-input px-3 py-2 font-mono text-xs leading-relaxed outline-none disabled:opacity-50 " +
          (editing
            ? "bg-transparent focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            : "cursor-default bg-secondary/30 text-muted-foreground")
        }
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          {effective.length} / {field.maxLength} znaků
        </p>
        {!editing && (
          <p className="text-[11px] text-muted-foreground">
            Prompt je zamčený proti náhodné úpravě — klikněte na Upravit.
          </p>
        )}
      </div>

      {field.warning && (
        <p
          className="rounded-md px-3 py-2 text-xs"
          style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}
        >
          {field.warning}
        </p>
      )}
    </div>
  );
}

interface Props {
  initial: SettingsValues;
}

export function PromptsClient({ initial }: Props) {
  // Celý objekt nastavení — POST posílá vše, číselné hodnoty se nesmí ztratit.
  const [values, setValues] = useState<SettingsValues>(initial);
  // Poslední uložený stav — „Zamknout" na něj vrací neuložené změny karty.
  const [savedValues, setSavedValues] = useState<SettingsValues>(initial);
  const [editing, setEditing] = useState<Record<TextSettingKey, boolean>>({
    systemPrompt: false,
    leadSummaryPrompt: false,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  function update(key: TextSettingKey, value: string | null) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
  }

  function startEdit(key: TextSettingKey) {
    setEditing((prev) => ({ ...prev, [key]: true }));
  }

  function cancelEdit(key: TextSettingKey) {
    // Zahodit neuložené změny karty a zamknout.
    setValues((prev) => ({ ...prev, [key]: savedValues[key] }));
    setEditing((prev) => ({ ...prev, [key]: false }));
    setStatus("idle");
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    setError("");

    // Normalizace: text po trim identický s výchozím → uloží se NULL, aby ruční
    // vrácení textu na default nezanechalo zbytečný override (a defaulty se dál
    // vyvíjely s deployi).
    const payload: SettingsValues = { ...values };
    for (const field of PROMPT_FIELDS) {
      const v = payload[field.key];
      if (v !== null && v.trim() === DEFAULTS[field.key].trim()) {
        payload[field.key] = null;
      }
    }

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Uložení selhalo");
        setStatus("error");
        return;
      }

      const saved = (await res.json()) as SettingsValues;
      setValues(saved);
      setSavedValues(saved);
      // Po úspěšném uložení se karty opět zamknou.
      setEditing({ systemPrompt: false, leadSummaryPrompt: false });
      setStatus("saved");
    } catch {
      setError("Chyba připojení");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        {PROMPT_FIELDS.map((field) => (
          <PromptCard
            key={field.key}
            field={field}
            value={values[field.key]}
            editing={editing[field.key]}
            disabled={saving}
            onChange={update}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Ukládám…" : "Uložit"}
        </Button>
        {status === "saved" && (
          <span className="text-sm text-[#0F6E56]">Uloženo</span>
        )}
        {status === "error" && (
          <span className="text-sm text-destructive">{error}</span>
        )}
      </div>
    </div>
  );
}
