import { getSettings } from "@/lib/settings";
import { PromptsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const initial = await getSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Prompty</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Systémové prompty chatu a shrnutí poptávek. Změny se po uložení
          projeví okamžitě — bez reindexace i bez redeploye. Dokud prompt
          neupravíte, platí výchozí text z kódu (a jeho vylepšení s každým
          nasazením).
        </p>
      </div>
      <PromptsClient initial={initial} />
    </div>
  );
}
