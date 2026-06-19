"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Result {
  content: string;
  page: number | null;
  document_id: string;
  filename: string;
  similarity: number;
}

export default function RetrievalTestPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setSearched(true);

    try {
      const res = await fetch("/api/retrieval-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Retrieval selhal");
        setResults([]);
        return;
      }

      const data = await res.json();
      setResults(data);
    } catch {
      setError("Chyba připojení");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Test retrievalu</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ověřte, jaké chunky vrátí vektorové vyhledávání pro zadaný dotaz
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zadejte testovací dotaz…"
          disabled={loading}
          className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <Button type="submit" disabled={loading || !query.trim()}>
          <Search size={16} className="mr-1.5" />
          {loading ? "Hledám…" : "Hledat"}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {searched && !loading && !error && results.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Žádné výsledky. Ověřte, že jsou nahrané a zaindexované dokumenty.
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {results.length} výsledků
          </p>
          {results.map((r, i) => (
            <div
              key={`${r.document_id}-${r.page}-${i}`}
              className="rounded-lg border border-border bg-card p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground truncate">
                  {r.filename}
                  {r.page ? `, str. ${r.page}` : ""}
                </span>
                <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums">
                  {(r.similarity * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-sm leading-relaxed">
                {r.content.length > 300
                  ? r.content.slice(0, 300) + "…"
                  : r.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
