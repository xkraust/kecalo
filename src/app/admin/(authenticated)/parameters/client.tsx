"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  SETTINGS_FIELDS,
  TELEMETRY_FIELDS,
  DEFAULT_SETTINGS,
  clampField,
  type SettingsValues,
  type NumericSettingKey,
  type ToggleSettingKey,
} from "@/lib/settings-meta";

interface Props {
  initial: SettingsValues;
}

export function ParametersClient({ initial }: Props) {
  const [values, setValues] = useState<SettingsValues>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  function update(key: NumericSettingKey, raw: number) {
    setValues((prev) => ({ ...prev, [key]: clampField(key, raw) }));
    setStatus("idle");
  }

  function updateToggle(key: ToggleSettingKey, checked: boolean) {
    setValues((prev) => ({ ...prev, [key]: checked }));
    setStatus("idle");
  }

  function handleReset() {
    setValues(DEFAULT_SETTINGS);
    setStatus("idle");
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    setError("");

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Uložení selhalo");
        setStatus("error");
        return;
      }

      const saved = (await res.json()) as SettingsValues;
      setValues(saved);
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
        {SETTINGS_FIELDS.map((field) => {
          const value = values[field.key];
          return (
            <div
              key={field.key}
              className="rounded-lg border border-border bg-card p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium">{field.label}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {field.description}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-secondary px-2.5 py-1 text-sm font-medium tabular-nums">
                  {field.format(value)}
                </span>
              </div>

              <div className="space-y-1.5">
                <Slider
                  value={value}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  onValueChange={(v) =>
                    update(field.key, typeof v === "number" ? v : v[0])
                  }
                />
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{field.format(field.min)}</span>
                  <span>{field.format(field.max)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Telemetrie</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Observabilita RAG pipeline přes Langfuse. Změny se po uložení projeví
            okamžitě.
          </p>
        </div>

        {TELEMETRY_FIELDS.map((field) => {
          const checked = values[field.key];
          return (
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
                  checked={checked}
                  onCheckedChange={(value) => updateToggle(field.key, value)}
                />
              </div>

              {field.warning && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-[#FAEEDA] px-2.5 py-1.5 text-xs text-[#854F0B]">
                  <span>{field.warning}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Ukládám…" : "Uložit"}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={saving}>
          Obnovit výchozí
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
