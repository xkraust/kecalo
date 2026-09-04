// Práva subjektu údajů — vyhledání a výmaz (GDPR etapa C, čl. 15/17/20).
//
// Server-only: service-role klient obchází RLS. Volat výhradně z rout za
// `requireAppRole("admin")`.
import { supabase } from "@/lib/supabase";
import { withSpan } from "@/lib/telemetry";
import {
  hashContact,
  contactSearchValues,
  type NormalizedContact,
} from "@/lib/privacy/contact";
import type { Lead } from "@/lib/types";

/** Řádek zpětné vazby tak, jak se ukazuje obsluze a vydává v exportu. */
export interface SubjectFeedback {
  id: string;
  session_id: string;
  message_index: number;
  rating: "up" | "down";
  /** Doslovný text dotazu, pokud byl uložen (viz E.3 plánu). */
  query: string | null;
  created_at: string;
}

export interface SubjectData {
  leads: Lead[];
  feedback: SubjectFeedback[];
  /** Session id, přes která se zpětná vazba dohledala (pro vysvětlení v UI). */
  sessionIds: string[];
}

/**
 * Najde poptávky podle kontaktu a přes jejich `session_id` navázanou zpětnou vazbu.
 *
 * ZNÁMÉ OMEZENÍ (zapsané i v docs/gdpr.md): `session_id` je jediný most mezi
 * anonymním chatem a identifikovaným kontaktem. Hlasy z jiného zařízení nebo od
 * někoho, kdo poptávku nikdy neposlal, dohledat nelze — pseudonymní data bez
 * účtu prostě nejdou spárovat s osobou.
 */
export async function findSubjectData(
  contact: NormalizedContact
): Promise<SubjectData> {
  const column = contact.kind === "email" ? "email" : "phone";

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")
    .in(column, contactSearchValues(contact))
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Vyhledání poptávek selhalo: ${error.message}`);
  }

  const sessionIds = [
    ...new Set(
      (leads ?? [])
        .map((l) => l.session_id)
        .filter((s): s is string => typeof s === "string" && s.length > 0)
    ),
  ];

  if (sessionIds.length === 0) {
    return { leads: (leads ?? []) as Lead[], feedback: [], sessionIds };
  }

  const { data: feedback, error: fbError } = await supabase
    .from("feedback")
    .select("id, session_id, message_index, rating, query, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false });

  if (fbError) {
    throw new Error(`Vyhledání zpětné vazby selhalo: ${fbError.message}`);
  }

  return {
    leads: (leads ?? []) as Lead[],
    feedback: (feedback ?? []) as SubjectFeedback[],
    sessionIds,
  };
}

export interface ErasureResult {
  leadsDeleted: number;
  feedbackDeleted: number;
}

/**
 * Trvale smaže data subjektu (čl. 17). Nevratné — volající musí mít potvrzení
 * obsluhy.
 *
 * Pořadí feedback → leads je záměrné: `session_id` z poptávek je jediná cesta
 * ke zpětné vazbě, takže smazat poptávky první by osiřelé řádky `feedback`
 * s doslovným textem dotazu nechalo v DB navždy.
 */
export async function eraseSubject(
  contact: NormalizedContact,
  performedBy: string
): Promise<ErasureResult> {
  return withSpan("privacy.erasure", async (span) => {
    const found = await findSubjectData(contact);

    let feedbackDeleted = 0;
    if (found.feedback.length > 0) {
      const { data, error } = await supabase
        .from("feedback")
        .delete()
        .in(
          "id",
          found.feedback.map((f) => f.id)
        )
        .select("id");
      if (error) {
        throw new Error(`Výmaz zpětné vazby selhal: ${error.message}`);
      }
      feedbackDeleted = data?.length ?? 0;
    }

    let leadsDeleted = 0;
    if (found.leads.length > 0) {
      const { data, error } = await supabase
        .from("leads")
        .delete()
        .in(
          "id",
          found.leads.map((l) => l.id)
        )
        .select("id");
      if (error) {
        throw new Error(`Výmaz poptávek selhal: ${error.message}`);
      }
      leadsDeleted = data?.length ?? 0;
    }

    // Auditní zápis nese jen klíčovaný otisk kontaktu, nikdy kontakt samotný.
    const audit = await supabase.from("privacy_actions").insert({
      kind: "erasure",
      subject_hash: hashContact(contact),
      leads_deleted: leadsDeleted,
      feedback_deleted: feedbackDeleted,
      performed_by: performedBy,
    });
    if (audit.error) {
      console.error("Zápis výmazu do privacy_actions selhal:", audit.error);
    }

    span.setAttributes({
      "erasure.leads_deleted": leadsDeleted,
      "erasure.feedback_deleted": feedbackDeleted,
    });

    return { leadsDeleted, feedbackDeleted };
  });
}
