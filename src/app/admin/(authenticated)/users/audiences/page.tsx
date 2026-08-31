import { supabase } from "@/lib/supabase";
import { AudiencesClient } from "./client";
import type { AudienceWithUsage } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AudiencesPage() {
  const [audiences, docLinks, roleLinks] = await Promise.all([
    supabase.from("audiences").select("code, label, created_at").order("label"),
    supabase.from("document_audiences").select("audience_code"),
    supabase.from("job_role_audiences").select("audience_code"),
  ]);

  // Počty použití: bez nich vypadá zablokované mazání (ON DELETE RESTRICT)
  // jako rozbitá aplikace — admin musí vidět, kde se štítek používá.
  const count = (rows: { audience_code: string }[] | null, code: string) =>
    (rows ?? []).filter((r) => r.audience_code === code).length;

  const items: AudienceWithUsage[] = (audiences.data ?? []).map((a) => ({
    code: a.code,
    label: a.label,
    created_at: a.created_at,
    document_count: count(docLinks.data, a.code),
    job_role_count: count(roleLinks.data, a.code),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">Štítky dokumentů</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Označují, komu obsah patří. Dokument dostane štítky, pracovní role je
          sdružuje — uživatel pak vidí dokumenty svých oddělení.
        </p>
      </div>
      <AudiencesClient audiences={items} />
    </div>
  );
}
