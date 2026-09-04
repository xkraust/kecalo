// Soukromí a osobní údaje (GDPR etapa C) — retenční parametry, práva subjektu
// a auditní historie. Jen pro roli admin (autorizaci drží routy, ne sidebar).
import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { getSessionUser } from "@/lib/session-user";
import { supabase } from "@/lib/supabase";
import { PrivacyClient, type PrivacyAction } from "./client";

export const dynamic = "force-dynamic";

/** Historie akcí se čte přímo tady — žádná API routa pro ni nevzniká. */
async function loadActions(): Promise<PrivacyAction[]> {
  const { data, error } = await supabase
    .from("privacy_actions")
    .select(
      "id, kind, subject_hash, leads_deleted, feedback_deleted, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Načtení historie privacy_actions selhalo:", error);
    return [];
  }
  return (data ?? []) as PrivacyAction[];
}

export default async function PrivacyPage() {
  const user = await getSessionUser();
  if (!user || user.appRole !== "admin") {
    redirect("/admin");
  }

  const [settings, actions] = await Promise.all([getSettings(), loadActions()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Soukromí a osobní údaje</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Doba uchování, vyřízení žádostí subjektů údajů a doložitelná stopa
          provedených výmazů.
        </p>
      </div>
      <PrivacyClient initial={settings} actions={actions} />
    </div>
  );
}
