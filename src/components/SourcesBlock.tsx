"use client";

import { FileText } from "lucide-react";

export interface Source {
  filename: string;
  page: number | null;
  similarity: number;
}

export function SourcesBlock({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;

  return (
    <details className="mt-2 group">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
        Zdroje ({sources.length})
      </summary>
      <ul className="mt-1.5 space-y-1">
        {sources.map((s, i) => (
          <li
            key={i}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <FileText size={12} className="shrink-0" />
            <span className="truncate">
              {s.filename}
              {s.page ? `, str. ${s.page}` : ""}
            </span>
            <span className="ml-auto shrink-0 tabular-nums">
              {Math.round(s.similarity * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
