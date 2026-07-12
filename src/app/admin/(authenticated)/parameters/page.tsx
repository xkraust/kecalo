import { getSettings } from "@/lib/settings";
import { ParametersClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ParametersPage() {
  const initial = await getSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">RAG parametry</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Globální nastavení RAG pro chat i test retrievalu. Změny se po uložení
          projeví okamžitě.
        </p>
      </div>
      <ParametersClient initial={initial} />
    </div>
  );
}
