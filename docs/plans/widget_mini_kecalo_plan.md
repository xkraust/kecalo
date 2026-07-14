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

- [ ] **1.1** Nový `src/lib/use-kecalo-chat.ts` (`"use client"`): přesun typu
  `ChatMessage`, konstanty `LEAD_TOKEN`, funkcí `stripLeadToken` a
  `getSessionId`, čítače `nextId` a pole `SAMPLE_QUESTIONS` (export) +
  hook `useKecaloChat()` vracející stav (`messages`, `input`, `setInput`,
  `isLoading`, `feedbackMap`, `sessionId`), akce (`sendMessage`,
  `handleFeedback`, `handleNewConversation`, `handleInputKeyDown` — Enter
  bez Shiftu odešle) a `scrollRef` s auto-scroll effectem. `AbortController`
  cleanup na unmount zůstává v hooku.
- [ ] **1.2** Nový `src/components/ChatMessages.tsx`: přesun obsahu
  scrollovatelné oblasti — prázdný stav (logo „J", nadpis, popis, vzorové
  otázky), mapování na `MessageBubble` vč. `conversation` slice
  (`.slice(0, i + 1).slice(-8)`), „píšící" tečky. Props `compact?: boolean`
  (menší paddingy, menší prázdný stav, vzorové otázky pod sebou, bez
  `max-w-2xl`) a `emptyStateDescription` (widget má kratší uvítání).
- [ ] **1.3** Přepsat `src/app/page.tsx` na `useKecaloChat()` +
  `<ChatMessages />` — JSX skelet stránky (header, vstupní lišta,
  disclaimer) i layoutové komentáře (`h-dvh`/`min-h-0`) zůstávají.
- [ ] **1.4** Kontrolní bod: `npm run lint` + `npm run build`; na `/` ověřit
  stream + zdroje, produktový dotaz → karta poptávky bez probliknutí tokenu,
  palce, „Nová konverzace" přeruší běžící stream.

## Milník 2 — Komponenta `ChatWidget`

- [ ] **2.1** Nový `src/components/ChatWidget.tsx` (`"use client"`): kořen
  `fixed bottom-4 right-4 z-50`, stav `open` (default zavřeno),
  `useKecaloChat()` žije zde → konverzace přežívá minimalizaci.
- [ ] **2.2** Zavřený stav: kruhová bublina 56 px (`bg-primary`, stín, ikona
  `MessageCircle`), `aria-label="Otevřít chat"` + `aria-expanded`; klik
  otevře panel a fokusuje input.
- [ ] **2.3** Otevřený stav: panel `w-[380px] h-[600px]`,
  `max-h-[calc(100dvh-3rem)] max-w-[calc(100vw-2rem)]`, `rounded-2xl`,
  stín, `role="dialog"`. Shora: korálová hlavička (logo „J", název
  „Pojišťovna Jistota", podtitul „Virtuální asistent", tlačítka
  `RotateCcw` nová konverzace + `Minus` minimalizovat) · zprávy
  (`ChatMessages compact`) · vstupní lišta (input + `Send`) · mini
  disclaimer.
- [ ] **2.4** Přepínání a animace: panel **vždy namountovaný** (stav, input
  i běžící stream přežijí minimalizaci — stream se neabortuje); skrývání
  čistě CSS (`opacity/translate/scale` transition 200 ms,
  `origin-bottom-right`, `pointer-events-none`) + `aria-hidden` a `inert`
  na zavřeném panelu; `Escape` minimalizuje.
- [ ] **2.5** Responsivita: na < 420 px panel drží `max-w`; `LeadForm`
  i `SourcesBlock` bez horizontálního scrollu při šířce panelu.

## Milník 3 — Demo stránka `/demo`

- [ ] **3.1** Nový `src/app/demo/page.tsx` (server komponenta, widget je
  client ostrov; `metadata.title`). Statický obsah v brand paletě:
  hlavička webu (logo + nefunkční nav), hero s CTA, 3 produktové karty
  (Pojištění majetku · Bytové domy · Odpovědnost), patička s infolinkou
  800 123 456, na konci `<ChatWidget />`. Stránka je veřejná (mimo
  ochranu proxy vrstvy).
- [ ] **3.2** Kontrolní bod: lint + build; vizuální kontrola `/demo`
  (bublina viditelná, bez layout shiftů).

## Milník 4 — E2E ověření (preview, důkazy screenshotem)

- [ ] **4.1** Regrese `/`: dotaz → stream + zdroje, palec, nová konverzace.
- [ ] **4.2** `/demo`: screenshot bubliny; klik → vysunutí panelu; screenshot.
- [ ] **4.3** Chat ve widgetu: vzorová otázka → stream + `SourcesBlock`;
  produktový dotaz → karta poptávky, token `[[NABIDKA]]` neprobliká.
- [ ] **4.4** Feedback ve widgetu: palec dolů bez produktové karty →
  karta `hodnoceni`.
- [ ] **4.5** Persistence: minimalizace uprostřed konverzace i během
  streamu → po otevření zprávy kompletní, rozepsaný input zachovaný.
- [ ] **4.6** Konzole bez chyb; `/api/chat` 200 s hlavičkou `X-Sources`.
- [ ] **4.7** Mobil 375×812: panel ve viewportu, bez horizontálního
  scrollu; screenshot.

## Milník 5 — Dokumentace a uzavření

- [ ] **5.1** Zaškrtat tento plán + zapsat výsledky ověření (datum, rozsah)
  do sekce Stav níže.
- [ ] **5.2** Aktualizovat `CLAUDE.md`: `/demo` v sekci Stránky a API routy;
  `ChatWidget.tsx`, `ChatMessages.tsx`, `use-kecalo-chat.ts` v adresářové
  struktuře; věta ve Stavu projektu s odkazem sem.
- [ ] **5.3** Zeptat se uživatele na commit + push (návrh: 2 commity —
  refactor extrakce logiky · widget + demo + docs).

---

## Rizika a poznámky

- **Hlavní riziko: refactor milníku 1** — proto vlastní kontrolní bod 1.4
  před psaním nového UI a doslovný přesun kódu místo přepisu.
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

- **Neimplementováno** — plán založen 14. 7. 2026, čeká se na pokyn
  k zahájení milníku 1.
