// Čištění extrahovaného textu před chunkováním (fáze 12).
// Odstraňuje opakovaná záhlaví/patičky stránek a spojuje řádky rozdělené sazbou PDF,
// aby do embeddingů nešel šum a rozsekané věty. Mapování na stránky se zachovává
// tím, že se čistí po stránkách (PageContent[] → PageContent[]).
import type { PageContent } from "./extract";

/**
 * Strukturní vzory řádků — jediný zdroj pravdy, sdílí čištění (kdy řádky
 * nespojovat) i parser struktury v chunk.ts (hranice sekcí).
 */
export const STRUCT = {
  /** „Část 1 – Společná ustanovení", „ODDÍL A …" */
  part: /^(?:ČÁST|Část|ODDÍL|Oddíl)\s+(\d+|[IVX]+|[A-Z])\b\.?\s*[-–—:]?\s*(.*)$/,
  /** „Článek 29" nebo „Článek 29 Pojistné plnění" */
  article: /^(?:ČLÁNEK|Článek|Čl\.)\s+(\d+[a-z]?)\.?\s*(.*)$/,
  /** „▶ 8) text odstavce" */
  para: /^▶\s*(\d+)\)\s*(.*)$/,
  /** „a) …" písmeno výčtu (i římské „ii)") — uvnitř se chunk nikdy nedělí */
  letter: /^[a-z]{1,4}\)\s/,
  /** odrážky (IPID a jiné dokumenty) */
  bullet: /^[•▪◦‣✔✓✘✗×!☑□]\s?/,
  /** markdown nadpis */
  mdHeading: /^#{1,6}\s/,
  /** číslovaný výčet „1)" / „1." */
  numbered: /^\d{1,3}[.)]\s/,
} as const;

/** Řádek začíná strukturní značkou — nový logický celek, nesmí se přilepit k předchozímu. */
export function isStructuralStart(line: string): boolean {
  return (
    STRUCT.part.test(line) ||
    STRUCT.article.test(line) ||
    STRUCT.para.test(line) ||
    STRUCT.letter.test(line) ||
    STRUCT.bullet.test(line) ||
    STRUCT.mdHeading.test(line) ||
    STRUCT.numbered.test(line)
  );
}

export interface CleanOptions {
  /** Odstraňovat opakovaná záhlaví/patičky stránek (default true). */
  stripHeaders?: boolean;
}

/** Kolik řádků od okraje stránky se považuje za zónu záhlaví/patičky. */
const EDGE_LINES = 3;
/** Zkratky, po kterých věta pokračuje, i když řádek končí tečkou. */
const ABBREV_END =
  /(?:^|\s)(?:č|čl|odst|písm|např|tzv|resp|vč|tj|apod|atd|str|Sb)\.$/i;

/** Normalizace pro porovnání záhlaví napříč stránkami — čísla (stránek) nahradí #. */
function normalizeLine(line: string): string {
  return line.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
}

/**
 * Najde normalizované řádky, které se opakují na začátku/konci většiny stránek
 * (záhlaví, patičky, čísla stránek). Bez hardcoded vzorů — čistě frekvenčně.
 */
function findRepeatedEdgeLines(pageLines: string[][]): Set<string> {
  const repeated = new Set<string>();
  // U 1–2stránkových dokumentů nelze opakování spolehlivě odlišit od obsahu.
  const threshold = Math.max(3, Math.ceil(pageLines.length * 0.6));
  const counts = new Map<string, number>();

  for (const lines of pageLines) {
    const edge = new Set<string>();
    for (const line of [...lines.slice(0, EDGE_LINES), ...lines.slice(-EDGE_LINES)]) {
      const norm = normalizeLine(line);
      if (norm.length > 0) edge.add(norm);
    }
    for (const norm of edge) counts.set(norm, (counts.get(norm) ?? 0) + 1);
  }

  for (const [norm, count] of counts) {
    if (count >= threshold) repeated.add(norm);
  }
  return repeated;
}

/** Věta na konci řádku zjevně pokračuje na dalším řádku → spojit. */
function shouldJoin(current: string, next: string): boolean {
  if (!current || !next) return false;
  if (isStructuralStart(next)) return false;
  if (/[.!?:]$/.test(current)) {
    // tečka za zkratkou větu nekončí
    return ABBREV_END.test(current) && /^[\p{Ll}0-9(„"'‚]/u.test(next);
  }
  if (/,$/.test(current)) return true;
  // pokračování začínající minuskou, číslicí nebo otevírací interpunkcí
  if (/^[\p{Ll}0-9(„"'‚]/u.test(next)) return true;
  // plně vyplněný zalomený řádek — pokračuje i před velkým písmenem (vlastní jména);
  // krátké řádky (nadpisy) se před velkým písmenem nespojují
  return current.length >= 60;
}

/** Spojí řádky rozdělené sazbou PDF (zalomené věty, slova dělená spojovníkem). */
function joinWrappedLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const prev = out[out.length - 1];

    if (prev !== undefined && prev !== "" && line !== "") {
      // slovo rozdělené spojovníkem na konci řádku
      if (/\p{L}-$/u.test(prev) && /^\p{Ll}/u.test(line)) {
        out[out.length - 1] = prev.slice(0, -1) + line;
        continue;
      }
      if (shouldJoin(prev, line)) {
        out[out.length - 1] = `${prev} ${line}`;
        continue;
      }
    }
    // víc prázdných řádků po sobě drž jako jeden
    if (line === "" && (prev === "" || prev === undefined)) continue;
    out.push(line);
  }
  while (out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * Vyčistí extrahované stránky: odstraní opakovaná záhlaví/patičky a slepí
 * rozlámané řádky. Vrací opět stránky — mapování obsahu na čísla stran
 * (kvůli citacím) tím zůstává zachované.
 */
export function cleanPages(
  pages: PageContent[],
  { stripHeaders = true }: CleanOptions = {}
): PageContent[] {
  let pageLines = pages.map((p) => p.text.split("\n"));

  if (stripHeaders) {
    const repeated = findRepeatedEdgeLines(pageLines);
    if (repeated.size > 0) {
      pageLines = pageLines.map((lines) =>
        lines.filter((line, i) => {
          const inEdge = i < EDGE_LINES || i >= lines.length - EDGE_LINES;
          return !(inEdge && repeated.has(normalizeLine(line)));
        })
      );
    }
  }

  const cleaned: PageContent[] = [];
  for (let i = 0; i < pages.length; i++) {
    const lines = joinWrappedLines(pageLines[i]);
    const text = lines.join("\n").trim();
    if (text.length > 0) cleaned.push({ page: pages[i].page, text });
  }
  return cleaned;
}
