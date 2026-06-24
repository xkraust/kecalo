import { supabase } from "@/lib/supabase";
import type { DocumentRecord, DocumentStatus } from "@/lib/types";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ChunksByDocChart } from "@/components/ChunksByDocChart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { data: documents } = await supabase
    .from("documents")
    .select("id, filename, status, chunk_count, created_at")
    .order("created_at", { ascending: false });

  const docs = (documents ?? []) as DocumentRecord[];

  const totalDocs = docs.length;
  const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0);
  const readyCount = docs.filter((d) => d.status === "ready").length;

  let distinctPages = 0;
  if (totalChunks > 0) {
    const { data: pages } = await supabase
      .from("chunks")
      .select("document_id, page");
    if (pages) {
      const unique = new Set(pages.map((p) => `${p.document_id}:${p.page}`));
      distinctPages = unique.size;
    }
  }

  const { data: feedbackRows } = await supabase
    .from("feedback")
    .select("rating");
  const fbUp = (feedbackRows ?? []).filter((r) => r.rating === "up").length;
  const fbDown = (feedbackRows ?? []).filter((r) => r.rating === "down").length;
  const fbTotal = fbUp + fbDown;

  const statusCounts: Record<string, number> = {};
  for (const d of docs) {
    statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;
  }

  const chartData = docs.map((d) => ({
    filename: d.filename,
    chunkCount: d.chunk_count,
    status: d.status as DocumentStatus,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">Přehled</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Stav znalostní báze
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Dokumenty" value={totalDocs} />
        <StatCard label="Chunky" value={totalChunks} />
        <StatCard label="Zaindexované strany" value={distinctPages} />
        <StatCard
          label="Připraveno"
          value={
            <>
              {readyCount}
              <span className="text-[15px] text-muted-foreground">
                {" "}
                / {totalDocs}
              </span>
            </>
          }
        />
        <StatCard
          label="Zpětná vazba"
          value={
            fbTotal === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <>
                <span title="Pozitivní">{"👍"} {fbUp}</span>
                <span className="text-[15px] text-muted-foreground mx-1">/</span>
                <span title="Negativní">{"👎"} {fbDown}</span>
              </>
            )
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-border p-5">
          <p className="text-sm font-medium mb-4">Chunky podle dokumentu</p>
          <ChunksByDocChart data={chartData} />
        </div>

        <div className="rounded-lg border border-border p-5">
          <p className="text-sm font-medium mb-4">Stavy dokumentů</p>
          {totalDocs === 0 ? (
            <p className="text-sm text-muted-foreground">
              Zatím žádné dokumenty.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {(["ready", "processing", "uploaded", "error"] as const).map(
                (status) => (
                  <div
                    key={status}
                    className="flex items-center justify-between"
                  >
                    <StatusBadge status={status} />
                    <span className="text-sm font-medium">
                      {statusCounts[status] ?? 0}
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
