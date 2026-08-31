// Odvození štítků publika pro filtr retrievalu (etapa C plánu rolí).
//
// Bezpečnostní jádro celé viditelnosti dokumentů: hodnota MUSÍ vzniknout
// serverově ze session, nikdy z těla požadavku, query parametru ani hlavičky.
// Kdyby ji směl poslat klient, bylo by omezení jen dekorace.
import { supabase } from "@/lib/supabase";
import type { SessionUser } from "@/lib/session-user";

/**
 * `null` = bez filtru viditelnosti (admin vidí vše),
 * `[]`   = jen veřejné dokumenty (anonymní tazatel).
 */
export type CallerAudiences = string[] | null;

/**
 * Efektivní štítky uživatele = sjednocení štítků všech jeho pracovních rolí
 * (view `user_effective_audiences`). Přímá vazba uživatel↔štítek neexistuje.
 */
export async function effectiveAudiences(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_effective_audiences")
    .select("audience_code")
    .eq("user_id", userId);

  if (error) {
    // Fail-closed: při chybě raději nic navíc neukázat než ukázat cizí obsah.
    console.error("Načtení štítků uživatele selhalo:", error);
    return [];
  }
  return [...new Set((data ?? []).map((r) => r.audience_code as string))];
}

/**
 * Štítky pro filtr retrievalu podle přihlášeného uživatele (nebo jeho absence).
 *
 * Admin bypass se ZÁMĚRNĚ neimplementuje vyjmenováním všech kódů z číselníku —
 * rozešel by se s nově přidaným štítkem mezi requesty. Místo toho `null`, které
 * `match_chunks` chápe jako „bez filtru".
 */
export async function audiencesForUser(
  user: SessionUser | null
): Promise<CallerAudiences> {
  if (!user) return [];
  if (user.appRole === "admin") return null;
  return effectiveAudiences(user.id);
}
