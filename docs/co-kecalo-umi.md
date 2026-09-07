# Co Kecalo umí

Přehled schopností administrace — podklad pro prezentaci a pro rychlé zorientování
nového člověka v tom, co se v aplikaci dá nastavit bez zásahu do kódu.

> **Prezentační podoba.** Týž obsah jako nastylovaná stránka je v `co-kecalo-umi.html` —
> otevře se přímo v prohlížeči, bez serveru a bez buildu. Zdrojem pravdy je **tenhle
> markdown**; HTML se z něj přepisuje, ne naopak.

> **Rozsah dokumentu.** Popisuje **stav administrace**, ne roadmapu. Sekce jsou v pořadí,
> v jakém stojí v levém menu. Co je rozpracované nebo odložené, je vypsané na konci
> v části „Mimo administraci"; podrobnosti drží `IMPLEMENTATION_PLAN.md` a `plans/`.

Kecalo je chatbot, který odpovídá **výhradně z nahraných dokumentů** a u každé odpovědi
uvádí, odkud ji má. Tenhle dokument není o modelu — je o tom, co si obsluha nastaví sama,
bez vývojáře a bez nasazení: znalostní báze, chování bota, oprávnění, poptávky i agenda
osobních údajů.

| | |
|---|---|
| **10** | sekcí administrace |
| **15** | parametrů laditelných za běhu |
| **3** | úrovně oprávnění |
| **0** | nasazení potřebných ke změně chování bota |

---

## Přehled — `/admin`

*Čtenář a výše*

**Stav znalostní báze na jeden pohled — bez SQL a bez dotazu na dodavatele.**

- **Metriky báze:** počet dokumentů, chunků, zaindexovaných stran a kolik dokumentů je
  připraveno odpovídat.
- **Spokojenost uživatelů** spočítaná z palců nahoru a dolů přímo v chatu — poměr i procento.
- **Nevyřízené poptávky** jako číslo, které říká, jestli se někdo má čemu věnovat.
- **Graf chunků podle dokumentu** — hned je vidět, který podklad bázi váhově ovládá.
- **Rozpad stavů** dokumentů: připraveno · zpracovává se · nahráno · chyba.

## Dokumenty — `/admin/documents`

*Editor a výše*

**Znalostní bázi mění byznys, ne vývojář. Nahrání souboru je celá integrace.**

- **Nahrání přetažením** — PDF, TXT a MD do 20 MB.
- **Automatické zpracování** na pozadí: extrakce textu → odstranění záhlaví a patiček →
  strukturní rozdělení podle částí a článků → výpočet embeddingů → uložení. Uživatel jen
  sleduje stav.
- **Chyba se vysvětlí** — u neúspěšného dokumentu je vidět důvod, ne jen červený štítek.
- **Reindexace jedním kliknutím**, bez opětovného nahrávání souboru.
- **Upozornění na zastaralou konfiguraci:** změní-li se parametry rozdělování, systém sám
  označí dokumenty, které je potřeba přeindexovat.
- **Viditelnost dokumentu:** veřejný, nebo omezený na vybrané štítky — jedna báze obslouží
  veřejnost i interní útvary.
- **Smazání** odstraní dokument, jeho pasáže i originál v úložišti.

## Poptávky — `/admin/leads`

*Editor a výše*

**Z konverzace vypadne kvalifikovaný kontakt, ne přepis chatu.**

- **Kontakt s kontextem:** jméno, e-mail nebo telefon a k tomu **automatické shrnutí
  konverzace** — obchodník čte, co člověk chtěl, ne surový dotaz.
- **Dva typy záznamu:** zájem o produkt (bot ho pozná sám z povahy dotazu) a kontakt
  zanechaný po záporném hodnocení odpovědi.
- **Workflow:** nová → převzatá → uzavřená, se jménem zpracovatele.
- **Deduplikace podle kontaktu** — druhý dotaz téhož člověka rozšíří existující záznam
  místo zakládání dubletu.
- **Poptávky se nemažou**, jen uzavírají — historie zůstává průkazná.

## Test retrievalu — `/admin/retrieval-test`

*Čtenář a výše*

**Než se zeptá klient, zeptá se obsluha — a vidí přesně, z čeho by bot odpovídal.**

- **Libovolný dotaz** vrátí pasáže, které by šly modelu do kontextu.
- **Skóre podobnosti v procentech** u každé pasáže — poznat rozdíl mezi jistým a nataženým
  zásahem.
- **Přesná adresa nálezu:** soubor, strana a cesta v dokumentu (část › článek › odstavec).
- **Rozbalení celého textu** pasáže, když je potřeba ověřit znění.

> Nástroj, který v konkurenčních demech obvykle chybí. Umožňuje reklamaci odpovědi vyřešit
> za minutu — buď je chyba v datech, nebo v nastavení, a je to vidět.

## RAG parametry — `/admin/parameters`

*Čtení všichni · změna správce*

**Chování vyhledávání se ladí posuvníkem, ne nasazením nové verze.**

- **Počet pasáží v kontextu** (1–20) — širší záběr proti většímu šumu.
- **Práh podobnosti** (0–100 %) — čím výš, tím dřív bot přizná, že odpověď nemá.
- **Teplota modelu** (0–1) — věcnost proti volnosti formulace.
- **Velikost pasáží** (1 500–6 000 znaků) a dva přepínače kvality indexace: hlavička
  s cestou v dokumentu, odstraňování opakovaných záhlaví.
- **Výchozí viditelnost** nově nahraných dokumentů — veřejná, nebo omezená báze.
- **Telemetrie** a samostatně **záznam obsahu dotazů** — zapnout jen na ladění, s varováním,
  že jde o osobní údaje.
- **Obnovení výchozích hodnot** jedním tlačítkem.

> Administrace sama rozlišuje, co se projeví okamžitě (parametry dotazu) a co až po
> reindexaci (parametry rozdělování) — a u druhé skupiny na to upozorní.

## Prompty — `/admin/parameters/prompts`

*Správce*

**Tón bota, jeho mantinely i formu citací lze přepsat v textovém poli. Změna platí okamžitě.**

- **Systémový prompt chatu** (do 8 000 znaků) — jak bot mluví, co smí, jak cituje zdroje.
- **Prompt pro shrnutí poptávek** (do 4 000 znaků) — co má obchodník v záznamu vidět.
- **Je vidět, co je vlastní a co výchozí:** každá karta nese štítek a jde jedním kliknutím
  vrátit na dodávané znění.
- **Ochrana proti překlepu:** karta je zamčená, editaci je nutné vědomě zapnout — přepsané
  prompty nemají historii verzí.
- **Varování u kritických instrukcí** — systém řekne, které pasáže se nesmí smazat, protože
  by vypnuly sběr poptávek nebo oslabily ochranu proti podvržení instrukcí.

## Uživatelé — `/admin/users`

*Správce*

**Účty zakládá správce — ale hesla si nevymýšlí a nikdy je nevidí uložená.**

- **Založení účtu:** jméno, příjmení, e-mail (slouží i jako přihlašovací údaj) a role.
- **Heslo generuje aplikace** a ukáže ho právě jednou; v databázi je od začátku jen otisk.
- **Vynucená změna při prvním přihlášení** — dokud si uživatel heslo nezmění, nesmí dělat
  nic jiného.
- **Reset hesla** a **deaktivace** účtu; účty se nemažou, aby zůstala dohledatelná historie.
- **Přiřazení pracovních rolí**, které rozhodují o přístupu k dokumentům.
- **Pojistky proti zamčení:** posledního správce nelze degradovat ani vypnout a nikdo si
  nemění vlastní roli.

## Pracovní role — `/admin/users/job-roles`

*Správce*

**Oprávnění se popisují slovy z organizace — „Vedoucí účtárny", ne technický štítek.**

- **Vlastní číselník rolí** podle struktury zákazníka.
- **Role sdružuje štítky dokumentů** — přidání štítku k roli zpřístupní obsah všem jejím
  nositelům naráz.
- **Mapování na skupinu ve firemním adresáři** — kdo je v IdP ve skupině „Obchod", dostane
  roli automaticky při přihlášení.

## Štítky dokumentů — `/admin/users/audiences`

*Správce*

**Jedna instance, jedna báze, různé publikum. Vyhledávání filtruje už v databázi.**

- **Zakládání, přejmenování a mazání** štítků (např. Právní oddělení, Interní metodika).
- **Počet dokumentů** u každého štítku — je vidět, co by smazání rozpojilo.
- **Štítek nikdy nedostane uživatel přímo**, vždy jen přes pracovní roli. Odebrání role
  odebere přístup naráz a bez výjimek.

## Soukromí a osobní údaje — `/admin/privacy`

*Správce*

**Žádost podle GDPR se vyřídí na obrazovce, ne e-mailem vývojáři.**

- **Retenční lhůty** zvlášť pro poptávky a zpětnou vazbu (1–120 měsíců).
- **Automatický denní úklid** — přepínač plus tlačítko „spustit teď".
- **Sběr kontaktů v chatu** jde vypnout — u interního nasazení nedává smysl.
- **Vyhledání subjektu** podle e-mailu nebo telefonu; funguje bez ohledu na velikost písmen
  a formát čísla.
- **Export do JSON** pro právo na přístup a přenositelnost (čl. 15 a 20).
- **Trvalý výmaz** na žádost (čl. 17) — poptávky i navázaná hodnocení naráz.
- **Auditní historie úkonů** s otiskem subjektu místo jeho kontaktu — evidence sama nesmí
  být další databází osobních údajů.
- **Právní titul u každého záznamu**, uložený v okamžiku sběru — doložitelný i po pozdější
  změně konfigurace.

> Veřejné zásady zpracování údajů si lhůty **čtou z nastavení**, místo aby je opisovaly.
> Změna lhůty v administraci proto nemůže udělat ze zveřejněného dokumentu nepravdu.

## Přihlášení a SSO — `/admin/login`

*Všichni*

**Heslo, nebo firemní účet — podle toho, co zákazník provozuje.**

- **Klasické přihlášení** e-mailem a heslem.
- **Přihlášení firemním účtem** (OIDC) — účet vznikne sám při prvním přihlášení, není potřeba
  ho předem zakládat.
- **Skupiny z firemního adresáře** se překlápějí na pracovní role při každém přihlášení;
  zdrojem pravdy zůstává adresář, ne Kecalo.
- **Indikátor konfigurace SSO** v administraci — pojmenuje chybějící nastavení, aby zapomenutá
  položka nevypadala jako vypnuté SSO.
- **Odhlášení platí okamžitě** na straně serveru; deaktivace účtu ukončí i běžící relaci.

---

## Kdo co smí

Tři aplikační role. Vodicí pravidlo: **editor spravuje obsah a agendu, ne systém** — chování
bota a přístupy zůstávají správci.

| Činnost | Čtenář | Editor | Správce |
|---|:---:|:---:|:---:|
| Prohlížet dokumenty, testovat retrieval, číst parametry | ano | ano | ano |
| Nahrávat, reindexovat a mazat dokumenty | — | ano | ano |
| Zpracovávat poptávky | — | ano | ano |
| Měnit RAG parametry a prompty | — | — | ano |
| Spravovat uživatele, pracovní role a štítky | — | — | ano |
| Retence, výmazy a žádosti subjektů | — | — | ano |

Oprávnění se čte z databáze při každém požadavku, ne z přihlašovací cookie — odebrání práv
platí okamžitě, ne až po odhlášení. Skrytí položky v menu je jen kosmetika; kontrola drží
na každé serverové operaci zvlášť (`requireAppRole`).

---

## Mimo administraci

Co patří do dodávky, i když se to nenastavuje kliknutím.

| | Stav | |
|---|---|---|
| **Dvě podoby chatu** | v provozu | Chat přes celou stránku a vysouvací widget v rohu. Obojí běží nad stejným kódem, takže úprava se propíše do obou. |
| **Provozní režim veřejný / interní** | v provozu | Veřejný chat pro zákazníky, nebo interní báze vyžadující přihlášení. Přepíná se konfigurací a administrace odvozený režim ukazuje. |
| **Vždy uvedený zdroj** | v provozu | Pod každou odpovědí stojí dokument, článek a strana. Odpověď bez opory bot nevymyslí — místo ní nasměruje na kontakt. |
| **Měřitelná kvalita** | v provozu | Každý dotaz má záznam s latencí a spotřebou; palce z chatu se ukládají jako skóre. Nad testovacími sadami běží automatické vyhodnocení. |
| **Redakce identity ve zdrojích** | v provozu | Při indexaci se z dokumentů odstraní identifikační údaje původce, aby demo mohlo běžet nad reálnými podklady. |
| **Widget na cizí web** | v přípravě | Vložení bubliny na existující web zákazníka jedním řádkem `<script>`. Dnes widget běží jen na stránkách Kecala — plán `plans/widget_embed_plan.md`. |
| **Strop provozních nákladů** | v přípravě | Denní limit útraty a sdílené omezení počtu dotazů pro veřejné nasazení — plán `plans/public_chat_protection_plan.md`. |

---

## Na co si dát pozor při demu

- **Retence je po nasazení vypnutá.** Schopnost existuje, ale úklid neběží, dokud ho správce
  vědomě nezapne. Při ukázce to vypadá, že nefunguje — protože nefunguje.
- **SSO je ověřené proti lokálnímu mock IdP**, ne proti reálnému tenantu. Kód se pro napojení
  nemění, doplňují se jen proměnné prostředí (`sso-setup.md`), ale slibovat hotové napojení
  by bylo předčasné.
- **Demo instance vystupuje jako Kecalo** nad podmínkami fiktivní pojišťovny. Obor není nikde
  zadrátovaný — bázi tvoří nahrané dokumenty, ať jde o pojišťovnu, výrobní firmu nebo úřad.
  Název, podtitul i logo mají jediný zdroj pravdy v `src/lib/brand.ts`.
