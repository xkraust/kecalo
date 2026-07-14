# Plán: Widget mini Kecalo — vysouvací chat v rohu + demo stránka

## Kontext a cíl

Vytvořit **mini verzi Kecala** ve stylu embeddovaného webchatu, jak ho znají
návštěvníci běžných webů (vzor: widget Mluvii/„Al.bert" na Smarty.cz — plovoucí
kruhová bublina v rohu obrazovky; po kliknutí se vysune malé chatovací okno
s hlavičkou v akcentní barvě, avatarem/názvem bota, oblastí zpráv a vstupním
řádkem s odesílacím tlačítkem; okno jde minimalizovat zpět do bubliny).

Dnes je chat Kecala výhradně fullscreen stránka `/` (`src/app/page.tsx`).
Cílem je stejný chat — stejná RAG pipeline, streamování, zdroje, token
`[[NABIDKA]]` → karta poptávky, zpětná vazba palci — v kompaktním vysouvacím
okně, tak jak by vypadal nasazený na webu pojišťovny.

## Rozhodnutí (potvrzeno uživatelem v konverzaci, 14. 7. 2026)

- **Fáze 1 (tento plán):** widget žije na nové **demo stránce v rámci aplikace**
  (`/demo`), která simuluje web „Pojišťovny Jistota". Žádný embed na cizí web.
- **Fáze 2 (vědomě odloženo, jen výhled):** embeddovatelný widget — route
  `/widget` + skript `public/embed.js`, který na libovolném webu vykreslí
  bublinu a iframe; komunikace přes `postMessage`, řešení CORS/CSP. Viz
  sekce „Výhled fáze 2" na konci.
- **Fullscreen chat na `/` zůstává beze změny chování** — vytáhne se z něj
  pouze sdílená logika (hook + seznam zpráv), aby widget i fullscreen jely
  nad jedním kódem a oprava/úprava chatu se propsala do obou.
- Žádná změna API rout, RAG pipeline, promptů ani DB schématu. Widget používá
  výhradně existující veřejná API: `POST /api/chat`, `POST /api/feedback`,
  `POST /api/leads`.

## Výchozí stav (zjištěno průzkumem kódu)

- Veškerá chatová logika je inline v `src/app/page.tsx` (`ChatPage`): stav
  `messages`/`input`/`isLoading`/`feedbackMap`, streamování z `POST /api/chat`
  (fetch + `ReadableStream` reader), parsování hlavičky `X-Sources`,
  `stripLeadToken` (odstranění `[[NABIDKA]]` vč. neúplného prefixu během
  streamu), `getSessionId` (localStorage `kecalo_session_id`), feedback,
  nová konverzace s abortem běžícího streamu, auto-scroll, `AbortController`
  cleanup na unmount (oprava E3).
- Vykreslování zpráv je už komponentové a použije se beze změny:
  `MessageBubble.tsx` → `SourcesBlock.tsx` + `LeadForm.tsx` (varianty
  `produkt`/`hodnoceni`).
- Brand tokeny (krémová `#FAF9F5`, korál `#D85A30`) jsou CSS proměnné
  v `globals.css` (Tailwind v4 `@theme`) — widget je zdědí automaticky.

---

## Milník 1 — Extrakce sdílené logiky (refactor `/` bez změny chování)

Cíl: po tomto milníku je `/` funkčně identická, ale logika i seznam zpráv jsou
znovupoužitelné. Milník musí být hotový a **ověřený před** psaním widgetu.
Kód se **přesouvá doslovně, nepřepisuje** — největší riziko celé fáze je
regresní chyba ve streamování / stripu tokenu.

- [x] **1.1** Nový `src/lib/use-kecalo-chat.ts` (`"use client"`): přesun typu
  `ChatMessage`, konstanty `LEAD_TOKEN`, funkcí `stripLeadToken` a
  `getSessionId`, čítače `nextId` a pole `SAMPLE_QUESTIONS` (export) +
  hook `useKecaloChat()` vracející stav (`messages`, `input`, `setInput`,
  `isLoading`, `feedbackMap`, `sessionId`), akce (`sendMessage`,
  `handleFeedback`, `handleNewConversation`, `handleInputKeyDown` — Enter
  bez Shiftu odešle; v `page.tsx` se dnes jmenuje `handleKeyDown`, jde jen
  o přejmenování při jinak doslovném přesunu) a `scrollRef` s auto-scroll
  effectem. `AbortController` cleanup na unmount zůstává v hooku.
- [x] **1.2** Nový `src/components/ChatMessages.tsx`: přesun obsahu
  scrollovatelné oblasti — prázdný stav (logo „J", nadpis, popis, vzorové
  otázky), mapování na `MessageBubble` vč. `conversation` slice
  (`.slice(0, i + 1).slice(-8)`), „píšící" tečky. Props: `messages`,
  `isLoading`, `feedbackMap`, `onFeedback`, `sendMessage` (vzorové otázky),
  `sessionId`, `scrollRef` + `compact?: boolean` (menší paddingy, menší
  prázdný stav, vzorové otázky pod sebou, bez `max-w-2xl`; nadpis prázdného
  stavu demotovat z `<h1>` — na `/demo` už `<h1>` má hero) a
  `emptyStateDescription` (widget má kratší uvítání).
- [x] **1.3** Přepsat `src/app/page.tsx` na `useKecaloChat()` +
  `<ChatMessages />` — JSX skelet stránky (header, vstupní lišta,
  disclaimer) i layoutové komentáře (`h-dvh`/`min-h-0`) zůstávají.
- [x] **1.4** Kontrolní bod: `npm run lint` + `npm run build`; na `/` ověřit
  stream + zdroje, produktový dotaz → karta poptávky bez probliknutí tokenu,
  palce, „Nová konverzace" přeruší běžící stream.
  - `npm run build` ✅ (TypeScript OK, `/` dál staticky prerenderovaná),
    `npm run lint` ✅ pro nové soubory (jediná chyba je preexistující
    `@ts-nocheck` v `scripts/langfuse-eval.mjs`, mimo rozsah).
  - **Funkční ověření v prohlížeči** ✅ (dev na portu 3001, 13. 7. 2026):
    prázdný stav renderuje identicky · vzorová otázka i Enter odešlou dotaz ·
    stream + markdown + blok „Zdroje (20)" + palce · produktový dotaz
    („kolik stojí sjednání") → karta poptávky mezi zdroji a palci, token
    `[[NABIDKA]]` z textu odstraněn (neproblikl) · „Nová konverzace" uprostřed
    streamu ho přeruší a vrátí čistý prázdný stav bez chybové hlášky
    (abort odchycen jako `AbortError`; 503 v Chrome = artefakt zrušeného
    fetch, předchozí dotazy 200) · konzole bez chyb.

## Milník 2 — Komponenta `ChatWidget`

- [x] **2.1** Nový `src/components/ChatWidget.tsx` (`"use client"`): kořen
  `fixed bottom-4 right-4 z-50`, stav `open` (default zavřeno),
  `useKecaloChat()` žije zde → konverzace přežívá minimalizaci.
- [x] **2.2** Zavřený stav: kruhová bublina 56 px (`bg-primary`, stín, ikona
  `MessageCircle`), `aria-label="Otevřít chat"` + `aria-expanded`; klik
  otevře panel a fokusuje input. Pozor: input uvnitř `inert` panelu nejde
  fokusovat — fokus provést effectem až po přepnutí `open` (odstranění
  `inert`).
- [x] **2.3** Otevřený stav: panel `w-[380px] h-[600px]`,
  `max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-2rem)]`, `rounded-2xl`,
  stín, `role="dialog"`. Shora: korálová hlavička (logo „J", název
  „Pojišťovna Jistota", podtitul „Virtuální asistent", tlačítka
  `RotateCcw` nová konverzace + `Minus` minimalizovat) · zprávy
  (`ChatMessages compact`) · vstupní lišta (input + `Send`) · mini
  disclaimer. (`max-h` upravena na `6rem` v kontrolním bodě 3.2 — viz
  poznámka tam.)
- [x] **2.4** Přepínání a animace: panel **vždy namountovaný** (stav, input
  i běžící stream přežijí minimalizaci — stream se neabortuje); skrývání
  čistě CSS (`opacity/translate/scale` transition 200 ms,
  `origin-bottom-right`, `pointer-events-none`) + `aria-hidden` a `inert`
  na zavřeném panelu; `Escape` minimalizuje.
- [x] **2.5** Responsivita: na < 420 px panel drží `max-w`; `LeadForm`
  i `SourcesBlock` bez horizontálního scrollu při šířce panelu.

## Milník 3 — Demo stránka `/demo`

- [x] **3.1** Nový `src/app/demo/page.tsx` (server komponenta, widget je
  client ostrov; `metadata.title`). Statický obsah v brand paletě:
  hlavička webu (logo + nefunkční nav), hero s CTA, 3 produktové karty
  (Pojištění majetku · Bytové domy · Odpovědnost), patička s infolinkou
  800 123 456, na konci `<ChatWidget />`. Stránka je veřejná (mimo
  ochranu proxy vrstvy).
- [~] **3.2** Kontrolní bod: lint + build; vizuální kontrola `/demo`
  (bublina viditelná, bez layout shiftů).
  - ESLint ✅ + `npm run build` ✅ (`/demo` staticky prerenderovaná).
  - **Vizuální kontrola v prohlížeči** ✅ (dev na portu 3001, 13. 7. 2026):
    hlavička webu · hero se 2 CTA · 3 produktové karty s ikonami · patička
    s infolinkou · korálová bublina vpravo dole · klik → panel se vysune,
    hlavička celá (po opravě `max-h` — viz níže), bez layout shiftů.
    Oprava: `max-h-[calc(100dvh-3rem)]` → `calc(100dvh-6rem)`, aby se na
    nízkých oknech neuřízla horní hlavička panelu nad viewportem (panel
    roste nahoru od bubliny, `max-h` musí rezervovat i její výšku + mezeru).

## Milník 4 — E2E ověření (důkazy screenshotem)

Ověřuje se **lokálně** (`npm run dev`, příp. `npm run build && next start`) —
Vercel preview by vyžadoval push, který je až v 5.3. Pokud by bylo potřeba
ověření na Vercelu, pushne se pracovní větev (po dohodě s uživatelem) a 5.3
pak řeší jen merge do main. **Ověřeno 13. 7. 2026 na `localhost:3001/demo`.**

- [x] **4.1** Regrese `/`: dotaz → stream + zdroje, palec, nová konverzace.
  (Ověřeno v kontrolním bodě 1.4 — fullscreen `/` funguje beze změny.)
- [x] **4.2** `/demo`: screenshot bubliny; klik → vysunutí panelu; screenshot.
- [x] **4.3** Chat ve widgetu: vzorová otázka → stream + `SourcesBlock`;
  produktový dotaz → karta poptávky, token `[[NABIDKA]]` neprobliká.
  (Produkt karta i token strip ověřeny — token v textu odpovědi nezůstal.)
- [x] **4.4** Feedback ve widgetu: palec dolů bez produktové karty →
  karta `hodnoceni` (text „Děkujeme za Vaši zpětnou vazbu… specialista").
- [x] **4.5** Persistence: minimalizace uprostřed konverzace i během
  streamu → po otevření zprávy kompletní, rozepsaný input zachovaný.
  (Minimalizace během streamu → stream doběhl na pozadí, odpověď kompletní —
  panel je vždy namountovaný, stream se neabortuje.)
- [x] **4.6** Konzole bez chyb; `/api/chat` 200 s hlavičkou `X-Sources`.
  (200 + blok „Zdroje" se vykreslil → X-Sources dorazila a byla naparsována.)
- [x] **4.7** Mobil 375×812: panel ve viewportu, bez horizontálního
  scrollu; screenshot. (Okno nešlo zmenšit pod min. šířku Chrome, proto
  ověřeno programově: panel na šířce 343px má `overflowX: 0`; dlouhé názvy
  zdrojů/sekcí jsou `truncate` — ořezávají se s „…", nescrollují.)

**Dodatečná oprava nalezená při manuálním testu widgetu (po M4, 14. 7. 2026):**
těsně po odeslání dotazu se krátce zobrazily dvě asistentské bubliny najednou
— prázdná (z `MessageBubble`, `content === ""`) a „píšící" tečky (z
`ChatMessages`). Oprava: `MessageBubble.tsx` nově vrací `null` pro prázdný
`content`, takže ve fázi před prvním tokenem je vidět jen tečky. Sdílená
komponenta → stejná oprava platí i pro fullscreen `/`. Ověřeno programovým
pollingem DOM během streamu (`maxEmptyBubbles: 0` po celou dobu).

## Milník 5 — Dokumentace a uzavření

- [x] **5.1** Zaškrtat tento plán + zapsat výsledky ověření (datum, rozsah)
  do sekce Stav níže.
- [x] **5.2** Aktualizovat `CLAUDE.md`: `/demo` v sekci Stránky a API routy;
  `ChatWidget.tsx`, `ChatMessages.tsx`, `use-kecalo-chat.ts` v adresářové
  struktuře; věta ve Stavu projektu s odkazem sem. Promítnout novou stránku
  a moduly i do `docs/ARCHITECTURE.md` (dle pracovního postupu projektu).
- [x] **5.3** Commit + push (2 commity — refactor extrakce logiky · widget
  + demo + docs; uživatel zadal přímo, bez čekání na potvrzení).

---

## Rizika a poznámky

- **Hlavní riziko: refactor milníku 1** — proto vlastní kontrolní bod 1.4
  před psaním nového UI a doslovný přesun kódu místo přepisu.
- **Bezpečnost:** žádná nová útočná plocha — widget používá jen existující
  veřejné routy se stávajícími rate limity (`/api/chat` 20/min,
  `/api/feedback` 10/min, `POST /api/leads` 5/min). Bezpečnostní hlavičky
  (`X-Frame-Options: DENY`, `frame-ancestors 'none'` — SEC-10,
  `next.config.ts`) se ve Fázi 1 **nesmí uvolňovat**; jejich revize patří
  až do fáze 2 (iframe embed). Klientský strip tokenu `[[NABIDKA]]`
  zajišťuje, že token neodchází zpět do historie `/api/chat` — refactor
  musí chování zachovat (testuje 1.4).
- Widget drží stav jen v paměti komponenty — refresh stránky konverzaci
  smaže (stejně jako fullscreen `/`; serverová historie = odložený dluh
  SEC-7).
- `getSessionId` sdílí localStorage klíč `kecalo_session_id` s fullscreen
  chatem — pro demo účel v pořádku (jedna „osoba" = jedna session).

## Výhled fáze 2 — embeddovatelný widget (neimplementuje se teď)

- Route `/widget` — kompaktní chat renderovaný samostatně (bez demo stránky),
  určený do iframe.
- `public/embed.js` — skript vložitelný jedním `<script>` tagem na cizí web:
  vykreslí bublinu, po kliknutí vytvoří iframe na `/widget`, řeší
  otvírání/zavírání a rozměry přes `postMessage`.
- K vyřešení: CSP/`frame-ancestors` (dnes Next config posílá bezpečnostní
  hlavičky), CORS pro API volání z iframe (stejný origin iframe → není
  potřeba), rate limity pro cizí provoz, případně tenant identifikace.

## Stav

- **Hotovo a E2E ověřeno** (14. 7. 2026) — milníky 1–5 dokončené. Widget
  (`ChatWidget.tsx`) i sdílená logika (`use-kecalo-chat.ts`,
  `ChatMessages.tsx`) fungují na demo stránce `/demo`; fullscreen `/`
  beze změny chování. Ověřeno lokálně na `localhost:3001` (dev server,
  Chrome automatizace) — stream, zdroje, karta poptávky (obě varianty),
  persistence přes minimalizaci, mobilní šířka, konzole bez chyb.
  Jedna doplňková oprava nad rámec plánu: dvojitá bublina po odeslání
  dotazu (viz poznámka u milníku 4).
- Fáze 2 (embeddovatelný widget `/widget` + `public/embed.js`) zůstává
  neimplementovaná — viz „Výhled fáze 2" výše.
