// Strukturní chunkování (fáze 12): text se dělí podle hierarchie dokumentu
// (část → článek → odstavec) místo pevného znakového okna. Každý chunk začíná
// breadcrumb hlavičkou, která se embeduje spolu s textem (levná verze
// contextual retrieval bez LLM). Bez překryvu — kontext nesou hlavičky
// a celistvost sekcí.
import type { PageContent } from "./extract";
import { STRUCT, isStructuralStart } from "./clean";

/** Výchozí cílová velikost chunku ve znacích (runtime hodnota z app_settings, fáze 13). */
const DEFAULT_TARGET_SIZE = 3500;
/** Poměr tvrdého stropu k cílové velikosti — delší sekce se dělí na hranicích výčtů/vět. */
const MAX_SIZE_RATIO = 1.3;
const MIN_CHUNK_LENGTH = 50;
/** Maximální délka řádku, který může být názvem článku / podnadpisem. */
const MAX_HEADING_LENGTH = 90;

export interface ChunkInput {
  document_id: string;
  chunk_index: number;
  page: number | null;
  content: string;
  section_path: string | null;
}

interface Line {
  text: string;
  page: number;
}

/** Ucelená významová jednotka dokumentu s cestou v hierarchii. */
interface Section {
  /** Cesta v hierarchii, např. ["Část 2 – …", "Článek 29 Pojistné plnění", "odst. 8 Ekologický benefit"]. */
  path: string[];
  /** Strana, na které sekce začíná (chunk přes více stran cituje začátek). */
  page: number;
  lines: string[];
}

function sectionLength(s: Section): number {
  return s.lines.reduce((sum, l) => sum + l.length + 1, 0);
}

/**
 * Parser struktury: projde řádky a rozdělí je na sekce podle vzorů
 * část / článek / ▶ odstavec / krátký podnadpis. Písmena výčtů (a), b))
 * hranici netvoří.
 */
function parseSections(lines: Line[]): Section[] {
  const sections: Section[] = [];
  let part: string | null = null;
  let article: string | null = null;
  let current: Section | null = null;
  let pendingSubhead: Line | null = null;

  const pathNow = () => [part, article].filter((x): x is string => x !== null);

  const flush = () => {
    if (current && current.lines.some((l) => l.trim().length > 0)) {
      sections.push(current);
    }
    current = null;
  };

  const ensureCurrent = (page: number): Section => {
    if (!current) current = { path: pathNow(), page, lines: [] };
    return current;
  };

  // Podnadpis-kandidát, po kterém nenásledoval ▶ odstavec, je obyčejný obsah.
  const commitPending = () => {
    if (!pendingSubhead) return;
    ensureCurrent(pendingSubhead.page).lines.push(pendingSubhead.text);
    pendingSubhead = null;
  };

  const nextNonEmpty = (from: number): string | null => {
    for (let j = from; j < lines.length; j++) {
      const t = lines[j].text.trim();
      if (t.length > 0) return t;
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const page = lines[i].page;
    const text = lines[i].text.trim();
    if (text.length === 0) {
      commitPending();
      continue;
    }

    const mPart = STRUCT.part.exec(text);
    if (mPart) {
      commitPending();
      flush();
      part = text;
      article = null;
      current = { path: pathNow(), page, lines: [] };
      continue;
    }

    const mArticle = STRUCT.article.exec(text);
    if (mArticle) {
      const inlineName = mArticle[2].trim();
      const next = nextNonEmpty(i + 1);
      // Řádek přehledu článků (TOC): „Článek N Název" následovaný hned dalším
      // nadpisem článku/části bez obsahu — není to skutečná hranice sekce.
      const tocLike =
        inlineName.length > 0 &&
        next !== null &&
        (STRUCT.article.test(next) || STRUCT.part.test(next));
      if (tocLike) {
        commitPending();
        ensureCurrent(page).lines.push(text);
        continue;
      }

      commitPending();
      flush();
      let name = inlineName;
      if (
        !name &&
        next !== null &&
        !isStructuralStart(next) &&
        next.length <= MAX_HEADING_LENGTH
      ) {
        // název článku na samostatném řádku pod „Článek N"
        name = next;
        do {
          i++;
        } while (lines[i].text.trim().length === 0);
      }
      article = name ? `Článek ${mArticle[1]} ${name}` : `Článek ${mArticle[1]}`;
      current = { path: pathNow(), page, lines: [] };
      continue;
    }

    const mPara = STRUCT.para.exec(text);
    if (mPara) {
      flush();
      const label = pendingSubhead
        ? `odst. ${mPara[1]} ${pendingSubhead.text}`
        : `odst. ${mPara[1]}`;
      current = {
        path: [...pathNow(), label],
        page: pendingSubhead?.page ?? page,
        lines: pendingSubhead ? [pendingSubhead.text, text] : [text],
      };
      pendingSubhead = null;
      continue;
    }

    commitPending();
    // Krátký samostatný řádek bez interpunkce = kandidát na podnadpis
    // (např. „Ekologický benefit" před ▶ 8). Jistotu dá až následující řádek.
    const subheadCandidate =
      text.length <= 60 &&
      /^\p{Lu}/u.test(text) &&
      !/[.,;:!?]$/.test(text) &&
      !isStructuralStart(text);
    if (subheadCandidate) {
      pendingSubhead = { text, page };
      continue;
    }

    ensureCurrent(page).lines.push(text);
  }

  commitPending();
  flush();
  return sections;
}

/** Fallback pro nestrukturované dokumenty: sekce = odstavce oddělené prázdným řádkem. */
function paragraphSections(lines: Line[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const { text, page } of lines) {
    const t = text.trim();
    if (t.length === 0) {
      if (current) sections.push(current);
      current = null;
      continue;
    }
    if (!current) current = { path: [], page, lines: [] };
    current.lines.push(t);
  }
  if (current) sections.push(current);
  return sections;
}

/**
 * Rozdělí předlouhou sekci na hranicích výčtů (nikdy uvnitř písmene),
 * jako poslední záchrana na hranicích vět.
 */
function splitOversized(
  section: Section,
  targetSize: number,
  maxSize: number
): Section[] {
  // skupiny řádků: nová začíná na strukturní značce (písmeno, odrážka, číslo)
  const groups: string[][] = [];
  for (const line of section.lines) {
    if (groups.length === 0 || isStructuralStart(line)) groups.push([line]);
    else groups[groups.length - 1].push(line);
  }

  // předlouhou skupinu (souvislý text) rozděl na hranicích vět
  const units: string[] = [];
  for (const group of groups) {
    const text = group.join("\n");
    if (text.length <= maxSize) {
      units.push(text);
      continue;
    }
    let rest = text;
    while (rest.length > maxSize) {
      let end = targetSize;
      const slice = rest.slice(0, end);
      const breakAt = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      if (breakAt > targetSize / 2) end = breakAt + 1;
      units.push(rest.slice(0, end).trim());
      rest = rest.slice(end).trim();
    }
    if (rest.length > 0) units.push(rest);
  }

  // greedy balení jednotek do částí o cílové velikosti
  const parts: Section[] = [];
  let acc: string[] = [];
  let accLen = 0;
  const emit = () => {
    if (acc.length > 0) {
      parts.push({ path: section.path, page: section.page, lines: acc });
    }
    acc = [];
    accLen = 0;
  };
  for (const unit of units) {
    if (acc.length > 0 && accLen + unit.length > targetSize) emit();
    acc.push(unit);
    accLen += unit.length + 1;
  }
  emit();
  return parts;
}

/** Nejdelší společný prefix cest sekcí (úroveň breadcrumbu sloučeného chunku). */
function commonPath(sections: Section[]): string[] {
  let prefix = sections[0].path;
  for (const s of sections.slice(1)) {
    let len = 0;
    while (len < prefix.length && len < s.path.length && prefix[len] === s.path[len]) {
      len++;
    }
    prefix = prefix.slice(0, len);
  }
  return prefix;
}

/**
 * Greedy skladač: balí celé sousední sekce téhož článku do chunků cílové
 * velikosti a přidává breadcrumb hlavičku.
 */
function packSections(
  sections: Section[],
  documentId: string,
  docTitle: string | null,
  targetSize: number,
  maxSize: number,
  breadcrumb: boolean
): ChunkInput[] {
  const chunks: ChunkInput[] = [];

  const emit = (group: Section[]) => {
    if (group.length === 0) return;
    const body = group.map((s) => s.lines.join("\n")).join("\n");
    if (body.trim().length < MIN_CHUNK_LENGTH) return;
    const path = commonPath(group);
    const header = breadcrumb
      ? [docTitle, ...path].filter(Boolean).join(" › ")
      : "";
    chunks.push({
      document_id: documentId,
      chunk_index: chunks.length,
      page: group[0].page,
      content: header ? `[${header}]\n${body}` : body,
      section_path: path.length > 0 ? path.join(" › ") : null,
    });
  };

  // sekce lze slučovat jen v rámci téhož článku (první dvě úrovně cesty)
  const scopeOf = (s: Section) => s.path.slice(0, 2).join(" › ");

  let group: Section[] = [];
  let groupLen = 0;
  for (const section of sections) {
    const len = sectionLength(section);
    if (
      group.length > 0 &&
      (scopeOf(section) !== scopeOf(group[0]) || groupLen + len > targetSize)
    ) {
      emit(group);
      group = [];
      groupLen = 0;
    }
    if (len > maxSize) {
      emit(group);
      group = [];
      groupLen = 0;
      for (const part of splitOversized(section, targetSize, maxSize)) {
        emit([part]);
      }
      continue;
    }
    group.push(section);
    groupLen += len;
  }
  emit(group);
  return chunks;
}

export interface ChunkOptions {
  /** Cílová velikost chunku ve znacích (runtime parametr, fáze 13). */
  targetSize?: number;
  /** Vkládat breadcrumb hlavičku na začátek obsahu chunku. */
  breadcrumb?: boolean;
}

/**
 * Rozdělí vyčištěné stránky dokumentu na chunky podle struktury.
 * `docTitle` (název dokumentu bez přípony) tvoří kořen breadcrumb hlavičky.
 */
export function chunkText(
  pages: PageContent[],
  documentId: string,
  docTitle: string | null = null,
  { targetSize = DEFAULT_TARGET_SIZE, breadcrumb = true }: ChunkOptions = {}
): ChunkInput[] {
  const lines: Line[] = [];
  for (const p of pages) {
    if (lines.length > 0) lines.push({ text: "", page: p.page });
    for (const text of p.text.split("\n")) lines.push({ text, page: p.page });
  }

  const totalChars = lines.reduce((sum, l) => sum + l.text.length, 0);
  if (totalChars < MIN_CHUNK_LENGTH) return [];

  let sections = parseSections(lines);

  // Dokument bez využitelné struktury (md, prostý text, IPID) → dělení po odstavcích.
  const structuredChars = sections
    .filter((s) => s.path.length > 0)
    .reduce((sum, s) => sum + sectionLength(s), 0);
  if (structuredChars < totalChars * 0.3) {
    sections = paragraphSections(lines);
  }

  const maxSize = Math.round(targetSize * MAX_SIZE_RATIO);
  return packSections(sections, documentId, docTitle, targetSize, maxSize, breadcrumb);
}
