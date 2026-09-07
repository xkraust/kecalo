// Redakce identity pojistitele ze zdrojových dokumentů (mimo číslované fáze).
//
// PROČ: znalostní bázi demo instalace tvoří REÁLNÉ pojistné podmínky, zatímco
// aplikace o sobě tvrdí, že běží „na datech fiktivní pojišťovny". Bez tohohle
// kroku model obchodní firmu opisuje přímo z kontextu („Pojištění bytového domu
// od X…“) a název se objeví i v `section_path`, který jde přes hlavičku
// X-Sources do bloku zdrojů v UI.
//
// KDE: mezi čištěním a chunkováním (viz `pipeline.ts`). Před chunkováním
// ZÁMĚRNĚ — parser struktury odvozuje `section_path` až z těchto stránek, takže
// redakce až za chunkováním by nadpisy nechala nedotčené.
//
// Prompt tenhle problém neřeší: model má text v kontextu a admin ho vidí
// v testu retrievalu. Pravidlo v promptu je jen záchranná síť pro případ, že
// název napíše sám uživatel.
import type { PageContent } from "./extract";

/**
 * Náhrada webu a e-mailů. `.example` je TLD rezervovaná v RFC 2606 — nikdy ji
 * nelze zaregistrovat, takže náhrada prokazatelně nemíří na žádnou skutečnou
 * firmu (na rozdíl od vymyšlené `.cz` domény, která může někomu patřit).
 */
const DOMAIN = "pojistovna.example";
/** Infolinka, kterou aplikace používá i ve FALLBACK_MESSAGE a na /demo. */
const PHONE = "800 123 456";
/** Jednotná náhrada za sídlo i doručovací adresy pojistitele. */
const ADDRESS = "Ulice 1, 100 00 Praha";

type Replacer = (
  groups: (string | undefined)[],
  offset: number,
  full: string
) => string;

interface Rule {
  pattern: RegExp;
  replacement: string | Replacer;
}

/**
 * Stojí pozice na začátku věty? Zpět přes bílé znaky: začátek textu, konec
 * předchozí věty nebo nový řádek. Používá se jen na místech, kam redakce
 * dosadila obecné podstatné jméno místo vlastního — jinde do velikosti písmen
 * nesaháme, aby se neměnil text, se kterým redakce nemá co dělat.
 */
function atSentenceStart(full: string, offset: number): boolean {
  let i = offset - 1;
  while (i >= 0 && /\s/.test(full[i])) {
    if (full[i] === "\n") return true;
    i--;
  }
  return i < 0 || /[.!?:•▶]/.test(full[i]);
}

/** „pojišťovny" → „Pojišťovny", ale jen na začátku věty (viz výše). */
function noun(ending: string, capitalized: boolean): string {
  const word = `pojišťovn${ending}`;
  return capitalized ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/**
 * POŘADÍ JE SOUČÁSTÍ NÁVRHU:
 *  - kolapsní pravidla 1 a 2 musí předcházet obecnému skloňování, jinak vznikne
 *    „pojišťovny pojišťovna" a „pojišťovnu pojišťovnu, a.s.",
 *  - verzálky před obecným pravidlem, jinak se rozbije velikost písmen nadpisů,
 *  - u webu platí pořadí URL → e-mail → holá doména: kdyby holá doména běžela
 *    dřív, snědla by `koop.cz` uvnitř adresy a zbylo by `info@www.…`.
 *
 * Název i slovo „pojišťovna" se skloňují podle vzoru „žena", takže se koncovka
 * přenáší 1:1 a nemusí se vypisovat pádová tabulka.
 */
const RULES: Rule[] = [
  // 1) Obchodní firma i s právní formou a skupinou: „Kooperativu pojišťovnu,
  //    a.s., Vienna Insurance Group, jako pojistitele" → „pojišťovnu, a.s., jako…"
  {
    pattern:
      /Kooperativ(?:a|u|y|ě|ou)\s+poji(?:š|s)(?:ť|t)ovn(a|u|y|ě|ou),?\s*a\.\s?s\.(?:,?\s*Vienna\s+Insurance\s+Group)?/g,
    replacement: (g, offset, full) =>
      `${noun(g[0] ?? "a", atSentenceStart(full, offset))}, a.s.`,
  },
  // 2) Opačné pořadí: „na infolince pojišťovny Kooperativa 957 105 105"
  {
    pattern: /poji(?:š|s)(?:ť|t)ovn(a|y|ě|u|ou)\s+Kooperativ(?:a|y|ě|u|ou)/g,
    replacement: (g, offset, full) =>
      noun(g[0] ?? "a", atSentenceStart(full, offset)),
  },
  // 3) Verzálkové nadpisy: „VÍTEJTE V KOOPERATIVĚ" → „VÍTEJTE V POJIŠŤOVNĚ".
  { pattern: /KOOPERATIV(A|Y|Ě|U|OU|O)/g, replacement: "POJIŠŤOVN$1" },
  // 4) Zbylé tvary názvu v běžném textu. Velké „K" znamenalo vlastní jméno;
  //    u obecného podstatného jména je velké písmeno na místě jen na začátku věty.
  {
    pattern: /([Kk])ooperativ(a|y|ě|u|ou|o)/g,
    replacement: (g, offset, full) =>
      noun(g[1] ?? "a", g[0] === "K" && atSentenceStart(full, offset)),
  },
  // 5) Plné URL i s cestou — jinak by po náhradě domény zbyl ocásek
  //    „/pojistovna-kooperativa/o-pojistovne…".
  {
    pattern: /https?:\/\/(?:www\.)?koop\.cz[^\s),;]*/gi,
    replacement: `https://www.${DOMAIN}`,
  },
  // 6) E-maily — lokální část zůstává (info@, dpo@), mění se jen doména.
  { pattern: /([A-Za-z0-9._%+-]+)@koop\.cz/gi, replacement: `$1@${DOMAIN}` },
  // 7) Holá doména.
  { pattern: /(?:www\.)?koop\.cz/gi, replacement: `www.${DOMAIN}` },
  // 8) Klientská linka, s předvolbou i bez ní.
  { pattern: /(?:\+420\s*)?957\s?105\s?105/g, replacement: PHONE },
  // 9) Zbytky skupiny, které nespolklo pravidlo 1 („Společnost X, VIG.").
  { pattern: /,?\s*Vienna\s+Insurance\s+Group/g, replacement: "" },
  // 10) IČO pojistitele — i v mezerované podobě „471 16 617“. Ostatní IČO
  //     v dokumentech patří jiným subjektům (asistenční služba, asociace)
  //     a ZÁMĚRNĚ se nemění: skrýváme identitu pojišťovny, ne cizích firem.
  { pattern: /IČO?:?\s*47\s?116\s?617/g, replacement: "IČO: 00000000" },
  { pattern: /\b471\s16\s617\b/g, replacement: "000 00 000" },
  // 11) Sídlo a doručovací adresy pojistitele.
  {
    pattern: /Pobřežní\s*665\/21,\s*186\s*00\s*Praha\s*8(?:\s*[–-]\s*Karlín)?/g,
    replacement: ADDRESS,
  },
  { pattern: /Brněnská\s*634,\s*664\s*42\s*Modřice/g, replacement: ADDRESS },
  { pattern: /Na\s+Příkopě\s*28,\s*115\s*03\s*Praha\s*1/g, replacement: ADDRESS },
];

/**
 * Úklid po náhradách. Smazání skupiny za sebou nechává „, ,", zdvojené mezery
 * a u „a.s., Vienna Insurance Group." i dvojtečku vět („a.s..").
 */
function tidy(text: string): string {
  return text
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(?<!\.)\.\.(?!\.)/g, ".");
}

/** Aplikuje redakční pravidla na jeden text. `count` = počet nahrazení. */
export function redactText(text: string): { text: string; count: number } {
  let out = text;
  let count = 0;
  for (const { pattern, replacement } of RULES) {
    out = out.replace(pattern, (...args) => {
      count++;
      // Poslední dva argumenty jsou offset a celý řetězec, mezi nimi skupiny.
      const full = args[args.length - 1] as string;
      const offset = args[args.length - 2] as number;
      const groups = args.slice(1, -2) as (string | undefined)[];
      if (typeof replacement === "function") {
        return replacement(groups, offset, full);
      }
      // Ruční expanze $1 — replace s funkcí zpětné reference nedosazuje samo.
      return replacement.replace(
        /\$(\d)/g,
        (_, i: string) => groups[Number(i) - 1] ?? ""
      );
    });
  }
  return { text: tidy(out), count };
}

/** Redakce po stránkách — mapování chunků na strany zůstává zachované. */
export function redactPages(pages: PageContent[]): {
  pages: PageContent[];
  count: number;
} {
  let count = 0;
  const out = pages.map((p) => {
    const r = redactText(p.text);
    count += r.count;
    return { ...p, text: r.text };
  });
  return { pages: out, count };
}
