# Asistent pro e-shop — napojení chatbota na objednávky a katalog

## Kontext

Zadání: chatbot jako rozhraní pro **přihlášeného zákazníka e-shopu** — zná jeho objednávky,
umí nabídnout zboží a provést nákupem.

Dnešní Kecalo je proti tomu jiný druh aplikace. `/api/chat` je **jeden průchod**:
`retrieve()` → jedno volání modelu → stream ([`route.ts`](../../src/app/api/chat/route.ts),
`streamText` bez `tools`). Model **čte a mluví**. Zadání po něm chce, aby **jednal**.

Tím se nemění jedna routa, ale bezpečnostní model celé aplikace: výstup modelu přestává být
text a stává se vedlejším účinkem. Proto je tenhle dokument spíš **architektonický návrh
druhého produktu na společném základu** než checklist rozšíření.

> **Stav zadání:** cílová platforma e-shopu není určena. Část úkolů níže je proto psaná jako
> kontrakt, ne jako konkrétní volání API — viz „Otevřené otázky".

## Tři zlomy oproti dnešku

**A — z jednoho průchodu na agentskou smyčku.** Model musí uprostřed odpovědi umět říct
„potřebuju stav objednávky", dostat data a pokračovat. Mechanicky malá změna (AI SDK má
`tools` a vícekrokové volání), následkem velká.

**B — identita.** Chat dnes neví, kdo se ptá. `kecalo_session_id` je náhodné UUID
v `localStorage` pro telemetrii, ne identita. Tabulka `users` je pro **zaměstnance**
a zákazníci do ní nepatří — jiný životní cyklus, jiný právní titul, jiný řád velikosti.

**C — historie na serveru.** SEC-7 je dnes vědomý dluh (konverzace žije v paměti prohlížeče).
U asistenta, který připravuje košík, přestává být dluhem a stává se překážkou.

---

## Co z dnešního Kecala přežije

| | |
|---|---|
| **Beze změny** | retrieval nad dokumenty, admin, aplikační role, štítky a pracovní role, prompty za běhu, telemetrie, zpětná vazba, GDPR aparát, widget |
| **Přestavba** | `/api/chat` (agentská smyčka), identita volajícího, historie konverzace |
| **Nové** | vrstva nástrojů, synchronizace katalogu, auditní log akcí, per-zákazník limity |
| **Přestává být volitelné** | denní strop útraty z [`public_chat_protection_plan.md`](public_chat_protection_plan.md) — přihlášená zákaznická báze generuje skutečný objem |

---

## Otevřené otázky (nutné zodpovědět před etapou 1)

1. **Cílová platforma.** Shoptet / Shopify / WooCommerce / vlastní řešení. Určuje adaptér,
   ne kontrakt. U Shoptetu je to doplňkové API, u Shopify existuje i oficiální MCP nad
   katalogem.
2. **Kde widget běží.** Přímo v e-shopu (same-origin, jednodušší identita), nebo v iframu
   podle [`widget_embed_plan.md`](widget_embed_plan.md) (identita přes podepsaný token).
3. **Rozsah zápisů.** Jen příprava košíku, nebo i storna a reklamace? Každý zápis navíc
   znamená vlastní potvrzovací kartu a vlastní auditní stopu.
4. **Kdo je správce údajů** — provozovatel e-shopu; Kecalo je zpracovatel. Nutná zpracovatelská
   smlouva a doplnění poskytovatele modelu jako dalšího zpracovatele.

---

## Architektura

### Identita — půjčuje se, nezrcadlí

E-shop předá **krátkodobě platný podepsaný token** přihlášeného zákazníka (JWT podepsaný
klíčem e-shopu, platnost v řádu minut, vázaný na origin). Kecalo ověří podpis proti veřejnému
klíči a tím zná zákazníka **pro tento požadavek**. Žádná tabulka zákazníků na naší straně.

> **Železné pravidlo:** model nikdy nepředává `customerId` jako parametr nástroje. Bere se
> výhradně ze serverově ověřené session. Jinak stačí, aby zákazník napsal „ukaž objednávky
> zákazníka 4712", a máte únik dat mezi zákazníky. Toto pravidlo se ověřuje testem, ne
> revizí kódu.

Poznámka k iframu: token předaný přes `postMessage` je další nedůvěryhodný vstupní kanál —
ověřuje se podpis, ne odesílatel zprávy.

### Vrstva nástrojů — kontrakt napřed, adaptér až potom

Definovat **úzký port** nezávislý na platformě a implementovat ho jako serverové funkce nad
REST API konkrétního e-shopu. Jeden adaptér na platformu, kontrakt zůstává.

| Nástroj | Kruh | Poznámka |
|---|---|---|
| `mojeObjednavky` | čtení, vázané na zákazníka | scope ze session, nikdy z parametru |
| `stavObjednavky` | čtení, vázané na zákazníka | včetně zásilky a faktury |
| `hledejProdukty` | čtení katalogu | přes retrieval nad popisy |
| `dostupnostACena` | čtení katalogu | **vždy živě**, nikdy z indexu |
| `pripravKosik` | zápis | vrací návrh, neprovádí |

### API, nebo MCP

**Napřed API.** MCP je protokol pro *cizí* nástroje; když vlastníte obě strany integrace, je
vlastní MCP server jen vrstva nepřímosti navíc — váš backend by volal váš vlastní server.

MCP se vyplatí ve dvou případech: platforma **už MCP server má** (ušetří se adaptér), nebo
má integraci dopsat **třetí strana** bez zásahu do našeho kódu. Kontrakt výše proto navrhnout
tak, aby šel na MCP vystavit — pak je to jednodenní práce, až to bude potřeba.

### Tři kruhy oprávnění

| Kruh | Příklad | Pravidlo |
|---|---|---|
| Čtení vázané na zákazníka | objednávky, zásilka, faktura | scope výhradně serverově ze session |
| Čtení katalogu | vyhledání, cena, dostupnost | cenu a skladovost vykreslovat **ze strukturovaných dat**, ne z textu modelu |
| Zápis a peníze | košík, kupón, objednávka, storno | model akci jen **připraví**, provede ji potvrzení člověkem |

Třetí řádek má v kódu předobraz: token `[[NABIDKA]]` → klient vykreslí `LeadForm` → člověk
odešle; model poptávku nikdy neuloží sám. Tenhle vzor stačí zobecnit na **akční karty** —
model vrátí strukturovaný návrh, UI ho vykreslí jako potvrditelnou kartu, akci provede až
kliknutí.

**Platba do chatu nepatří.** Připravený košík se předá standardní pokladně e-shopu. Ušetří to
celý rozsah PCI i právní vrstvu (obchodní podmínky, odstoupení od smlouvy, informační
povinnosti), kterou má pokladna vyřešenou.

### Katalog se nedá indexovat jako PDF

Dnešní indexace je ruční upload a ruční reindexace. Katalog je živý. Potřebuje **inkrementální
synchronizaci** z produktového feedu nebo webhooků.

**Cena a skladovost do embeddingů nepatří** — embedovat jen stabilní popisný text, aktuální
hodnoty tahat nástrojem v okamžiku odpovědi. Jinak bot odcituje cenu z minulého týdne, což
v maloobchodu není trapas, ale právní problém.

---

## Etapa 1 — identita a „kde je moje objednávka"

Jen čtení, nulové riziko zápisu. Pokryje většinu objemu zákaznické podpory a je **samostatně
prodejná** — nemusí se sázet na celek.

- [ ] **1.1** Ověření podepsaného tokenu zákazníka (`src/lib/customer/identity.ts`):
  veřejný klíč z env, kontrola podpisu, expirace, publika a originu. Neplatný token =
  anonymní návštěvník, ne chyba — bot dál odpovídá z dokumentů.
- [ ] **1.2** Adaptér e-shopu (`src/lib/eshop/`): rozhraní `EshopAdapter` + první
  implementace podle zvolené platformy. Čtení objednávek zákazníka a stavu zásilky.
- [ ] **1.3** Nástroje `mojeObjednavky` a `stavObjednavky` — `customerId` se do nich
  dosazuje z ověřené identity, **nikdy z argumentů modelu** (v signatuře nemá co dělat).
- [ ] **1.4** `/api/chat`: zapnout vícekrokové volání s tooly. Nástroje se registrují
  **jen když je identita ověřená** — anonym je nemá k dispozici vůbec.
- [ ] **1.5** Výsledky nástrojů vkládat do kontextu izolované jako nedůvěryhodná data
  (vzor SEC-9 z `LEAD_SUMMARY_PROMPT`).
- [ ] **1.6** Serverová historie konverzace (dluh SEC-7) — vázaná na zákazníka, s vlastní
  retenční lhůtou v `/admin/privacy`.
- [ ] **1.7** Auditní log volání nástrojů: kdo, kdy, co, s jakým výsledkem. Bez zápisů zatím
  jen čtení, ale tabulka musí vzniknout dřív než první zápis.
- [ ] **1.8** Rozšíření systémového promptu o pravidla pro práci s objednávkami — přes
  `/admin/parameters/prompts`, ne v kódu.
- [ ] **1.9** Ověření: cizí `customerId` v dotazu nesmí vrátit cizí data; vypršelý token =
  degradace na anonymní režim; injection v poznámce k objednávce nesmí spustit nástroj.

## Etapa 2 — katalog a doporučení

- [ ] **2.1** Synchronizace katalogu: inkrementální import produktů (feed nebo webhooky),
  embedding **jen popisného textu**.
- [ ] **2.2** Nástroje `hledejProdukty` a `dostupnostACena`; cena a skladovost výhradně živě.
- [ ] **2.3** Komponenta produktové karty — cena, dostupnost a odkaz se vykreslují ze
  strukturovaných dat, ne z prózy modelu.
- [ ] **2.4** Admin: stav synchronizace katalogu (poslední běh, počet položek, chyby).
- [ ] **2.5** Ověření: změna ceny v e-shopu se projeví v odpovědi okamžitě, bez reindexace.

## Etapa 3 — příprava košíku a předání pokladně

- [ ] **3.1** Zobecnění vzoru `[[NABIDKA]]` na **akční karty**: model vrací strukturovaný
  návrh, klient vykreslí potvrzení, akci provede až kliknutí uživatele.
- [ ] **3.2** Nástroj `pripravKosik` — vrací návrh košíku, nezakládá ho.
- [ ] **3.3** Předání do pokladny e-shopu s připraveným obsahem; **platba zůstává tam**.
- [ ] **3.4** Auditní zápis každé potvrzené akce.
- [ ] **3.5** Ověření: žádná cesta, kterou by model dokončil objednávku bez kliknutí člověka.

---

## Bezpečnost

- **Prompt injection přestává být teorie.** Dnes je nejhorší následek špatná odpověď;
  s nástroji můžou instrukce schované v popisu produktu, v recenzi nebo v poznámce
  k objednávce spustit akci. V marketplace e-shopech je popis produktu obsah od cizí osoby.
  Pravidlo: **každý výsledek nástroje je data, ne instrukce** — systémově, ne případ od případu.
- **Žádný zápis bez potvrzení člověkem.** Ani „bezpečný" (přidání do košíku).
- **Scope na serveru, ne v promptu.** Instrukce „odpovídej jen o objednávkách tohoto zákazníka"
  není bezpečnostní opatření.
- **Per-zákazník limity** vedle dnešního per-IP; přihlášený uživatel je jiná jednotka.

## Ochrana osobních údajů

Posun je podstatný: z minimálního sběru se stává zpracování objednávkových dat.

- Právní titul se mění ze **souhlasu** na **plnění smlouvy**.
- Provozovatel e-shopu je správce, Kecalo zpracovatel → **zpracovatelská smlouva**.
- Poskytovatel modelu se stává dalším zpracovatelem, kterému tečou data o nákupech →
  doplnit do `docs/gdpr.md` a na `/privacy`.
- `record_content` musí zůstat vypnutý **natvrdo**, ne přepínačem.
- Minimalizace do promptu: číslo a stav objednávky, ne celý profil zákazníka.

## Námitka k zadání

**„Provede celým nákupním procesem" bych nedělal** — a ne z technických důvodů.

Konverzační pokladna dlouhodobě konvertuje hůř než optimalizovaná pokladna e-shopu, která je
navíc právně ošetřená. Hodnota asistenta je jinde: **najít správný produkt** a **posprodejní
podpora**; těch je objemově víc. Předání do standardní pokladny s připraveným košíkem je
přednost, ne kompromis.

Pokud se na plném průchodu trvá, jde postavit — ale až za etapou 3 a s měřením konverze proti
dnešní pokladně, ne proti nule.

## Co plán vědomě neřeší

- **Platba v chatu** (viz výše) a s ní celý rozsah PCI.
- **Multi-tenance** — jedna instance obsluhuje jeden e-shop, stejně jako dnes jednu bázi.
- **Personalizované doporučování z historie nákupů** — je to samostatná disciplína
  (a samostatná GDPR rozvaha o profilování), ne vedlejší produkt retrievalu.
- **Hlasové ovládání** — viz [`voice_gemini_live_plan.md`](voice_gemini_live_plan.md).
- **Vlastní MCP server** — až bude důvod (viz „API, nebo MCP").

## Stav

- **Návrh — neimplementováno.** Vypracováno 7. 9. 2026. Před etapou 1 je potřeba zodpovědět
  „Otevřené otázky".
