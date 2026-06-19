"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "md"]);

interface UploadZoneProps {
  onUploadComplete: () => void;
}

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return "Povolené formáty: PDF, TXT, MD";
    }
    if (file.size > MAX_SIZE) {
      return "Maximální velikost souboru je 20 MB";
    }
    return null;
  }

  const upload = useCallback(
    async (file: File) => {
      const err = validate(file);
      if (err) {
        setError(err);
        return;
      }

      setError("");
      setUploading(true);

      try {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch("/api/documents", {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Upload selhal");
          return;
        }

        onUploadComplete();
      } catch {
        setError("Chyba připojení");
      } finally {
        setUploading(false);
      }
    },
    [onUploadComplete]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragging
            ? "border-primary bg-accent"
            : "border-border bg-secondary/50"
        )}
      >
        {uploading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Nahrávám…
          </div>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Přetáhni PDF / TXT / MD sem, nebo
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Vybrat soubor
            </Button>
            <p className="text-xs text-muted-foreground">Max 20 MB</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md"
        className="hidden"
        onChange={handleFileChange}
      />

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
