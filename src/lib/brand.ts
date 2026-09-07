/**
 * Značka aplikace — jediný zdroj pravdy pro název, podtitul a iniciálu loga.
 *
 * Bez server importů (jako `settings-meta.ts`), aby ho směly importovat
 * klientské komponenty i `metadata` v server souborech.
 *
 * Podtitul se ZÁMĚRNĚ zobrazuje přímo pod názvem všude, kde se značka objeví:
 * ukázková báze stojí na datech smyšlené pojišťovny a návštěvník to musí poznat
 * dřív, než odpovědi vezme za informace o skutečném produktu.
 */
export const BRAND = {
  name: "Kecalo",
  tagline: "Příklad aplikace na datech fiktivní pojišťovny",
  initial: "K",
} as const;
