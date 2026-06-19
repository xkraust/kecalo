import type { RetrievalResult } from "./retrieve";

export const SYSTEM_PROMPT = `Jsi asistent pojišťovny Jistota. Odpovídáš výhradně na základě poskytnutých úryvků z oficiálních dokumentů (kontext níže). Pravidla:
(1) Pokud odpověď v kontextu není, řekni to otevřeně a odkaž na infolinku 800 123 456 — nikdy si nedomýšlej.
(2) Odpovídej česky, stručně a srozumitelně, bez právního žargonu, ale věcně přesně.
(3) U každé odpovědi uveď, ze kterého dokumentu čerpáš.
(4) Neposkytuj právní ani finanční poradenství nad rámec citovaných podmínek a nesjednávej žádné produkty.
(5) Na otázky nesouvisející s pojištěním zdvořile odpověz, že pomáháš pouze s dotazy k produktům pojišťovny.`;

export const FALLBACK_MESSAGE =
  "Na tuto otázku v dostupných podmínkách nenacházím odpověď. Obraťte se prosím na infolinku **800 123 456**.";

export function buildContextBlock(chunks: RetrievalResult[]): string {
  return chunks
    .map((c, i) => {
      const source = c.page
        ? `${c.filename}, strana ${c.page}`
        : c.filename;
      return `<document index="${i + 1}" source="${source}">\n${c.content}\n</document>`;
    })
    .join("\n\n");
}
