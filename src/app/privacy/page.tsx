// Zásady zpracování osobních údajů (GDPR etapa D.1).
//
// Veřejná stránka ZÁMĚRNĚ mimo proxy matcher — subjekt údajů se k ní musí
// dostat dřív, než cokoli odešle, tedy i bez přihlášení.
//
// Doby uchování se NEOPISUJÍ ručně, čtou se z `app_settings` přes getSettings().
// Kdyby tu byla natvrdo napsaná čísla, změna lhůty v administraci by z těchhle
// zásad tiše udělala nepravdivý dokument.
//
// POZOR: text je funkční draft k právní kontrole, ne právní stanovisko.
// Místa označená `DOPLNIT` musí správce vyplnit před ostrým provozem —
// bez identifikace správce zásady nesplňují čl. 13.
import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zásady zpracování osobních údajů — Pojišťovna Jistota",
  description:
    "Jaké osobní údaje chatbot zpracovává, proč, jak dlouho a jaká máte práva.",
};

/**
 * Identifikace správce. Vyplní správce před ostrým provozem — do té doby
 * zůstávají zástupné texty viditelné i na stránce, aby chybějící údaj nešlo
 * přehlédnout (tichý placeholder by se do produkce protáhl snadno).
 */
const CONTROLLER = {
  name: "Pojišťovna Jistota",
  legal: "DOPLNIT: obchodní firma, IČO a sídlo správce",
  email: "DOPLNIT: kontaktní e-mail pro uplatnění práv",
  phone: "800 123 456",
};

/** Zpracovatelé, kterým se údaje předávají. Držet v souladu se skutečností. */
const PROCESSORS: { name: string; purpose: string; location: string }[] = [
  {
    name: "Anthropic (Claude)",
    purpose: "generování odpovědí — odchází text dotazu a část konverzace",
    location: "USA (třetí země)",
  },
  {
    name: "Voyage AI",
    purpose: "převod dotazu na vektor pro vyhledání v dokumentech",
    location: "USA (třetí země)",
  },
  {
    name: "Mistral AI",
    purpose: "shrnutí konverzace připojené k odeslané poptávce",
    location: "EU (Francie)",
  },
  {
    name: "Supabase",
    purpose: "databáze a úložiště — poptávky, hodnocení, dokumenty",
    location: "DOPLNIT: region projektu (ověřit v nastavení Supabase)",
  },
  {
    name: "Langfuse",
    purpose: "provozní telemetrie — latence, počty tokenů, technická metadata",
    location: "DOPLNIT: region instance (EU/USA dle konfigurace)",
  },
  {
    name: "Vercel",
    purpose: "provoz aplikace; v provozních protokolech i IP adresa",
    location: "USA (třetí země)",
  },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/** Skloňování měsíců — stejné pravidlo jako v administraci. */
function months(n: number): string {
  if (n === 1) return "1 měsíc";
  if (n >= 2 && n <= 4) return `${n} měsíce`;
  return `${n} měsíců`;
}

export default async function PrivacyPage() {
  const settings = await getSettings();

  // Varianta textu se ODVOZUJE ze skutečné konfigurace, nemá vlastní nastavení
  // (GDPR etapa G.5). Kdyby se přepínala zvlášť, rozešlo by se, co aplikace
  // dělá, a co o sobě tvrdí — a to je přesně ten druh rozporu, který zásady
  // zpracování diskvalifikuje.
  const internal = !config.publicChat;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium">
              J
            </div>
            <span className="text-[15px] font-medium">
              {CONTROLLER.name}
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Zpět do chatu
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-xl font-medium">
            Zásady zpracování osobních údajů
          </h1>
          <p className="text-sm text-muted-foreground">
            {internal
              ? "Tyto zásady popisují, jaké údaje zaznamenává interní chatbot znalostní báze, z jakého důvodu, jak dlouho je uchováváme a jaká máte práva."
              : "Tyto zásady popisují, jaké údaje zpracováváme v souvislosti s chatbotem na tomto webu, z jakého důvodu, jak dlouho je uchováváme a jaká máte práva."}
          </p>
        </div>

        <Section title="Kdo údaje zpracovává">
          <p>
            Správcem osobních údajů je {CONTROLLER.name},{" "}
            <strong>{CONTROLLER.legal}</strong>. Ve věcech ochrany osobních
            údajů nás kontaktujte na <strong>{CONTROLLER.email}</strong> nebo
            telefonicky na {CONTROLLER.phone}.
          </p>
        </Section>

        <Section title="Co zpracováváme a proč">
          <p>
            <strong>Dotazy položené chatbotu.</strong> Text dotazu odesíláme
            poskytovatelům jazykového modelu, abychom mohli sestavit odpověď
            z dokumentů znalostní báze. Konverzaci neukládáme na server — zůstává
            jen ve vašem prohlížeči, dokud ji nezavřete nebo nezaložíte novou.
          </p>
          {settings.leadCaptureEnabled && (
            <p>
              <strong>Poptávka (jméno, e-mail, telefon, poznámka).</strong>{" "}
              Zpracováváme ji, abychom vás mohli kontaktovat k vašemu dotazu.
              K poptávce ukládáme také automatické shrnutí konverzace, ze které
              vznikla, aby kolega věděl, čeho se dotaz týkal. Právním základem
              je{" "}
              <strong>váš souhlas</strong>, který udělujete zaškrtnutím
              políčka u formuláře.
            </p>
          )}
          <p>
            <strong>Hodnocení odpovědi (palec nahoru/dolů).</strong> U{" "}
            <strong>záporného</strong> hodnocení ukládáme spolu s hlasem i text
            hodnoceného dotazu, abychom poznali, které odpovědi selhávají,
            a mohli je zlepšit. U kladného hodnocení text neukládáme — odpověď
            fungovala a není co dohledávat. Právním základem je náš{" "}
            <strong>oprávněný zájem</strong> na funkčnosti a kvalitě služby.
            Hodnocení je anonymní — samo o sobě vás neidentifikuje.
          </p>
          <p>
            <strong>Provozní telemetrie.</strong> Sledujeme technické údaje
            o provozu (doba odpovědi, počty zpracovaných tokenů, chybovost) na
            základě <strong>oprávněného zájmu</strong> na stabilitě služby.
            Ve výchozím nastavení do telemetrie neposíláme obsah dotazů ani
            odpovědí.
          </p>
        </Section>

        <Section title="Jak dlouho údaje uchováváme">
          <ul className="list-disc space-y-1.5 pl-5">
            {settings.leadCaptureEnabled && (
              <li>
                Poptávky: nejdéle{" "}
                <strong>{months(settings.retentionLeadsMonths)}</strong> od
                poslední komunikace s vámi.
              </li>
            )}
            <li>
              Hodnocení odpovědí: nejdéle{" "}
              <strong>{months(settings.retentionFeedbackMonths)}</strong> od
              jejich vzniku.
            </li>
            <li>
              Konverzace v chatu: neukládáme je na server vůbec.
            </li>
          </ul>
          <p>
            Po uplynutí uvedené doby údaje trvale mažeme. Provozní protokoly
            u poskytovatele hostingu se řídí jeho vlastní dobou uchování a
            obsahují mimo jiné IP adresu.
          </p>
        </Section>

        <Section title="Komu údaje předáváme">
          <p>
            Údaje nepředáváme třetím osobám k jejich vlastním účelům. Využíváme
            však zpracovatele, bez nichž by služba nefungovala. Část z nich
            sídlí mimo Evropskou unii — předání se opírá o smluvní záruky
            sjednané s těmito poskytovateli.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Zpracovatel</th>
                  <th className="py-1.5 pr-3 font-medium">Účel</th>
                  <th className="py-1.5 font-medium">Umístění</th>
                </tr>
              </thead>
              <tbody>
                {PROCESSORS.map((p) => (
                  <tr key={p.name} className="border-t border-border">
                    <td className="py-1.5 pr-3 align-top text-foreground">
                      {p.name}
                    </td>
                    <td className="py-1.5 pr-3 align-top">{p.purpose}</td>
                    <td className="py-1.5 align-top whitespace-nowrap">
                      {p.location}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Vaše práva">
          <p>
            Máte právo na přístup ke svým údajům, na jejich opravu nebo výmaz,
            na omezení zpracování, na přenositelnost údajů a právo vznést
            námitku proti zpracování založenému na oprávněném zájmu. Souhlas
            udělený u poptávky můžete <strong>kdykoli odvolat</strong>; odvolání
            nemá vliv na zpracování provedené do té doby.
          </p>
          <p>
            Kterékoli z těchto práv uplatníte zprávou na{" "}
            <strong>{CONTROLLER.email}</strong>. Abychom údaje nevydali
            nesprávné osobě, můžeme vás před vyřízením požádat o ověření
            totožnosti. Domníváte-li se, že zpracováváme údaje v rozporu
            s předpisy, máte právo podat stížnost u Úřadu pro ochranu osobních
            údajů (uoou.gov.cz).
          </p>
          <p>
            Pozn.: hodnocení odpovědí dokážeme s vaší osobou spojit jen tehdy,
            pokud jste ve stejné konverzaci odeslali i poptávku. Bez toho jde
            o anonymní údaj, který k vám nelze přiřadit.
          </p>
        </Section>

        {internal && (
          <Section title="Informace pro zaměstnance">
            <p>
              Tento nástroj je interní: odpovídá jen přihlášeným uživatelům
              a rozsah dokumentů, které vidíte, se řídí vaší pracovní rolí.
            </p>
            <p>
              Zaznamenává se, <strong>že</strong> jste položili dotaz (technická
              metadata provozu), a pokud odpověď ohodnotíte palcem dolů, uloží se
              i <strong>text hodnoceného dotazu</strong> — slouží ke zlepšování
              odpovědí. U kladného hodnocení se text neukládá. Záznamy nejsou
              nástrojem kontroly výkonu ani chování a nepoužívají se k hodnocení
              zaměstnanců; plníme jimi informační povinnost podle § 316
              zákoníku práce.
            </p>
            <p>
              Znalostní báze může obsahovat osobní údaje klientů. Přístup k nim
              je řízen štítky dokumentů podle pracovní role — obsah, na který
              nemáte oprávnění, se vám v odpovědích neobjeví.
            </p>
          </Section>
        )}

        <Section title="Cookies a údaje v prohlížeči">
          <p>
            Chatbot <strong>nepoužívá cookies</strong> ani analytické či
            reklamní nástroje. Do úložiště vašeho prohlížeče ukládáme jedinou
            hodnotu — náhodný identifikátor konverzace{" "}
            <code className="rounded bg-secondary px-1 py-0.5 text-xs">
              kecalo_session_id
            </code>
            . Slouží k tomu, aby se vaše hodnocení nezapočítalo dvakrát a aby
            odeslaná poptávka navazovala na správnou konverzaci.
          </p>
          <p>
            Protože jde o údaj nezbytný pro fungování služby, který nesledujeme
            napříč weby, nezobrazujeme souhlasovou lištu s cookies. Identifikátor
            odstraníte vymazáním dat webu v prohlížeči.
          </p>
        </Section>

        <Section title="Účinnost">
          <p>
            Zásady mohou být upraveny; aktuální znění je vždy dostupné na této
            adrese.
          </p>
        </Section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-5 text-xs text-muted-foreground">
          {CONTROLLER.name} · {CONTROLLER.phone}
        </div>
      </footer>
    </div>
  );
}
