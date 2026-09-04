// Normalizace a otisk kontaktu subjektu údajů (GDPR etapa C).
//
// Normalizační funkce jsou sdílené se zápisem poptávky (api/leads/route.ts) —
// ZÁMĚRNĚ jedna implementace: kdyby se rozešly, vyhledání subjektu by nenašlo
// vlastní uložený řádek a žádost o výmaz by tiše skončila jako „nic nenalezeno".
import { createHmac } from "node:crypto";

/** E-mail se normalizuje (lowercase, trim) — normalizovaně se i ukládá,
 * aby deduplikace porovnávala konzistentní hodnoty. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Telefon na číslice s případným úvodním `+` (bez mezer/pomlček/závorek). */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}

export type ContactKind = "email" | "phone";

export interface NormalizedContact {
  kind: ContactKind;
  value: string;
}

/**
 * Rozpozná, zda jde o e-mail nebo telefon, a vrátí normalizovanou hodnotu.
 * `null` = nepoužitelný vstup (obsluha se překlepla).
 */
export function normalizeContact(raw: unknown): NormalizedContact | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes("@")) {
    const value = normalizeEmail(trimmed);
    return value.length <= 120 ? { kind: "email", value } : null;
  }

  const value = normalizePhone(trimmed);
  // Stejný tvar jako PHONE_REGEX v api/leads/route.ts.
  return /^\+?\d{9,19}$/.test(value) ? { kind: "phone", value } : null;
}

/**
 * Hodnoty, pod kterými se kontakt hledá v `leads`.
 *
 * VÝHRADNĚ pro čtení — zápis poptávky dál ukládá jedinou normalizovanou
 * podobu. Rozšíření je tu proto, že telefon nikdo nepíše dvakrát stejně:
 * jeden návštěvník zadá „777 123 456", jiný „+420 777 123 456", a obojí je
 * tentýž člověk. Kdyby hledání trvalo na doslovné shodě, žádost o výmaz by
 * skončila jako „nic nenalezeno" a údaje by v bázi zůstaly.
 *
 * Obsluha nálezy před výmazem vidí, takže případná shoda cizího čísla se
 * stejnou národní částí se pozná dřív, než se něco smaže.
 */
export function contactSearchValues(contact: NormalizedContact): string[] {
  if (contact.kind === "email") return [contact.value];

  const v = contact.value;
  const variants = new Set<string>([v]);
  if (v.startsWith("+420")) {
    variants.add(v.slice(4)); // +420777123456 → 777123456
  } else if (!v.startsWith("+")) {
    variants.add(`+420${v}`); // 777123456 → +420777123456
    variants.add(`+${v}`); // 420777123456 → +420777123456
  }
  return [...variants];
}

/**
 * Otisk kontaktu pro auditní tabulku `privacy_actions`.
 *
 * HMAC, ne holý SHA-256: prostor telefonních čísel i běžných e-mailů je malý
 * a slovníkově prolomitelný, takže by nekeyovaný otisk byl pořád osobním
 * údajem — a auditní evidence by se stala dalším zpracováním. Se serverovým
 * tajemstvím plní svůj jediný účel („tento výmaz proběhl") stejně.
 *
 * Klíč: PRIVACY_HASH_SECRET, jinak odvozeno ze SESSION_SECRET (aby otisk
 * fungoval i bez další povinné proměnné). Změna klíče rozpojí staré otisky —
 * pro audit to není chyba, jen je nelze zpětně spárovat s kontaktem.
 */
export function hashContact(contact: NormalizedContact): string {
  const key = process.env.PRIVACY_HASH_SECRET || process.env.SESSION_SECRET;
  if (!key) {
    throw new Error(
      "Chybí PRIVACY_HASH_SECRET i SESSION_SECRET — nelze vytvořit otisk kontaktu."
    );
  }
  return createHmac("sha256", key)
    .update(`${contact.kind}:${contact.value}`)
    .digest("hex");
}
