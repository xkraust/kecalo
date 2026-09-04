// Retence osobních údajů — automatický i ruční úklid (GDPR etapa B).
//
// Jediná implementace pro obě vstupní branky: denní cron
// (/api/cron/retention) a tlačítko v /admin/privacy. Kdyby existovaly dvě,
// rozešly by se — a rozdíl by se projevil jako smazaná data navíc.
//
// Server-only: používá service-role klienta, který obchází RLS.
import { supabase } from "@/lib/supabase";
import { getSettings } from "@/lib/settings";
import { withSpan } from "@/lib/telemetry";

export interface RetentionResult {
  /** true = retence je vypnutá, nic se nemazalo. */
  skipped: boolean;
  leadsDeleted: number;
  feedbackDeleted: number;
  /** Hranice, před kterou se mazalo (ISO), pro výpis v adminu. */
  leadsCutoff: string | null;
  feedbackCutoff: string | null;
}

/** Datum o `months` měsíců zpět. Přetečení měsíců řeší Date sám. */
function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

/**
 * Smaže osobní údaje po uplynutí retenční lhůty.
 *
 * @param performedBy id přihlášeného uživatele u ručního spuštění; `null` u cronu.
 */
export async function runRetention({
  performedBy = null,
}: { performedBy?: string | null } = {}): Promise<RetentionResult> {
  return withSpan("privacy.retention", async (span) => {
    const settings = await getSettings();

    if (!settings.retentionEnabled) {
      // Vypnutá retence NIC nemaže a ani nezapisuje audit — nebyl žádný úkon.
      span.setAttributes({ "retention.skipped": true });
      return {
        skipped: true,
        leadsDeleted: 0,
        feedbackDeleted: 0,
        leadsCutoff: null,
        feedbackCutoff: null,
      };
    }

    const leadsCutoff = monthsAgo(settings.retentionLeadsMonths).toISOString();
    const feedbackCutoff = monthsAgo(
      settings.retentionFeedbackMonths
    ).toISOString();

    // Poptávky se mažou podle `updated_at`, NE `created_at`: deduplikace při
    // opakované poptávce řádek aktualizuje, takže lhůta má běžet od poslední
    // interakce se subjektem, ne od prvního kontaktu.
    const leads = await supabase
      .from("leads")
      .delete()
      .lt("updated_at", leadsCutoff)
      .select("id");

    if (leads.error) {
      throw new Error(`Úklid poptávek selhal: ${leads.error.message}`);
    }

    const feedback = await supabase
      .from("feedback")
      .delete()
      .lt("created_at", feedbackCutoff)
      .select("id");

    if (feedback.error) {
      throw new Error(`Úklid zpětné vazby selhal: ${feedback.error.message}`);
    }

    const leadsDeleted = leads.data?.length ?? 0;
    const feedbackDeleted = feedback.data?.length ?? 0;

    // Auditní zápis i při nulových počtech: doložitelné musí být, že úklid
    // proběhl, ne jen že něco smazal (čl. 5 odst. 2).
    const audit = await supabase.from("privacy_actions").insert({
      kind: "retention",
      subject_hash: null,
      leads_deleted: leadsDeleted,
      feedback_deleted: feedbackDeleted,
      performed_by: performedBy,
    });

    if (audit.error) {
      // Data už jsou smazaná — chybu auditu nelze vzít zpět, ale musí být vidět.
      console.error("Zápis do privacy_actions selhal:", audit.error);
    }

    span.setAttributes({
      "retention.skipped": false,
      "retention.leads_deleted": leadsDeleted,
      "retention.feedback_deleted": feedbackDeleted,
    });

    return {
      skipped: false,
      leadsDeleted,
      feedbackDeleted,
      leadsCutoff,
      feedbackCutoff,
    };
  });
}
