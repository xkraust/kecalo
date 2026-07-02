"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  SETTINGS_FIELDS,
  TELEMETRY_FIELDS,
  CHUNKING_SLIDER_FIELDS,
  CHUNKING_TOGGLE_FIELDS,
  ALL_TOGGLE_FIELDS,
  DEFAULT_SETTINGS,
  clampField,
  type SettingField,
  type ToggleField,
  type SettingsValues,
  type NumericSettingKey,
  type ToggleSettingKey,
} from "@/lib/settings-meta";

interface Props {
  initial: SettingsValues;
}

function SliderCard({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: number;
  onChange: (key: NumericSettingKey, raw: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
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
            onChange(field.key, typeof v === "number" ? v : v[0])
          }
        />
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{field.format(field.min)}</span>
          <span>{field.format(field.max)}</span>
        </div>
      </div>
    </div>
  );
}

function ToggleCard({
  field,
  checked,
  gatedOff,
  onChange,
}: {
  field: ToggleField;
  checked: boolean;
  gatedOff: boolean;
  onChange: (key: ToggleSettingKey, checked: boolean) => void;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-card p-5 ${
        gatedOff ? "opacity-60" : ""
      }`}
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
          disabled={gatedOff}
          onCheckedChange={(value) => onChange(field.key, value)}
        />
      </div>

      {gatedOff ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Vyžaduje zapnutou telemetrii.
        </p>
      ) : (
        field.warning && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-[#FAEEDA] px-2.5 py-1.5 text-xs text-[#854F0B]">
            <span>{field.warning}</span>
          </div>
        )
      )}
    </div>
  );
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

  async function updateToggle(key: ToggleSettingKey, checked: boolean) {
    setValues((prev) => ({ ...prev, [key]: checked }));
    setStatus("idle");

    // Při zapnutí přepínače, na kterém závisí jiná pole, načti jejich aktuální hodnotu
    // čerstvě z DB — zahodí neuložené lokální změny, které se mezitím "schovaly" pod
    // disabled (přepínač byl zašedlý při vypnuté závislosti).
    if (!checked) return;
    const dependents = ALL_TOGGLE_FIELDS.filter((f) => f.dependsOn === key);
    if (dependents.length === 0) return;
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const fresh = (await res.json()) as SettingsValues;
      setValues((prev) => {
        const next = { ...prev };
        for (const f of dependents) next[f.key] = fresh[f.key];
        return next;
      });
    } catch {
      // necháme současnou hodnotu (prototyp) — fetch nemusí projít
    }
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
        {SETTINGS_FIELDS.map((field) => (
          <SliderCard
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={update}
          />
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Telemetrie</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Observabilita RAG pipeline přes Langfuse. Změny se po uložení projeví
            okamžitě.
          </p>
        </div>

        {TELEMETRY_FIELDS.map((field) => (
          <ToggleCard
            key={field.key}
            field={field}
            checked={values[field.key]}
            // Závislé pole se jen zašedne a znemožní změnu, když je jeho závislost
            // vypnutá. Hodnota se nemění — přepínač zobrazuje skutečnou uloženou hodnotu.
            gatedOff={field.dependsOn ? !values[field.dependsOn] : false}
            onChange={updateToggle}
          />
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Chunkování</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Parametry indexace dokumentů — působí při zpracování dokumentu, ne při
            dotazu.
          </p>
        </div>

        <div className="rounded-md bg-[#FAEEDA] px-3 py-2 text-xs text-[#854F0B]">
          Změny chunkování se projeví až po reindexaci — u již zaindexovaných
          dokumentů použijte tlačítko Reindexovat v sekci{" "}
          <Link href="/admin/documents" className="font-medium underline">
            Dokumenty
          </Link>
          .
        </div>

        {CHUNKING_SLIDER_FIELDS.map((field) => (
          <SliderCard
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={update}
          />
        ))}
        {CHUNKING_TOGGLE_FIELDS.map((field) => (
          <ToggleCard
            key={field.key}
            field={field}
            checked={values[field.key]}
            gatedOff={field.dependsOn ? !values[field.dependsOn] : false}
            onChange={updateToggle}
          />
        ))}
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
