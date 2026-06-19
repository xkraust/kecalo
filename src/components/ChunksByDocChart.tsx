import type { DocumentStatus } from "@/lib/types";

interface ChunksByDocChartProps {
  data: Array<{ filename: string; chunkCount: number; status: DocumentStatus }>;
}

export function ChunksByDocChart({ data }: ChunksByDocChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Zatím žádné dokumenty.
      </p>
    );
  }

  const max = Math.max(...data.map((d) => d.chunkCount), 1);

  return (
    <div className="flex flex-col gap-3">
      {data.map((doc) => (
        <div key={doc.filename}>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span className="truncate mr-4">{doc.filename}</span>
            <span>{doc.chunkCount}</span>
          </div>
          <div className="h-2 rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(doc.chunkCount / max) * 100}%`,
                backgroundColor:
                  doc.status === "processing" ? "#EF9F27" : "#D85A30",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
