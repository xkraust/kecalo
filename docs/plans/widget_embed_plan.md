# Fáze 2 widgetu — embed na cizí web

## Kontext

Widget (`src/components/ChatWidget.tsx`) dnes funguje **jen na stránkách, které
servíruje samo Kecalo** — konkrétně na `/demo`. Klient, který provozuje vlastní
web a chtěl by na něm mít jen tu bublinu v rohu, ji tam dnes nedostane žádnou
cestou:

- `<script>` embed neexistuje (`public/` obsahuje jen ikony z Next.js šablony),
- iframe je zablokovaný — [`next.config.ts`](../../next.config.ts) ř. 7–12 posílá
  `X-Frame-Options: DENY` a `Content-Security-Policy: frame-ancestors 'none'`
  na **všechny** routy (oprava SEC-10),
- kopie komponenty do cizího webu není řešení: je to React komponenta uvnitř
  téhle Next.js aplikace.

Jediné, co klient dnes reálně může, je odkaz na fullscreen chat v nové záložce.

Tento plán tu díru zavírá. Navazuje na
[`widget_mini_kecalo_plan.md`](widget_mini_kecalo_plan.md) (fáze 1 — hotová)
a jeho sekci „Výhled fáze 2"; provozní podmínky veřejného provozu řeší
samostatně [`public_chat_protection_plan.md`](public_chat_protection_plan.md)
(viz „Vztah k ochrannému plánu" níže).

**Rozsah:** jedna instance Kecala = jedna znalostní báze, vložitelná na jeden
nebo víc webů téhož zákazníka. Sdílení jedné instance mezi zákazníky
(multi-tenance) plán neřeší a je to jiný problém — viz „Co plán vědomě neřeší".

---

## Architektura embedu

```
web zákazníka (https://klient.cz)
└── <script src="https://kecalo-klient.vercel.app/embed.js" defer>
    └── #kecalo-widget (closed shadow DOM)
        ├── <button> bublina           ← kreslí embed.js, ~4 KB, bez závislostí
        └── <iframe src=".../widget">  ← vzniká až při prvním kliknutí
            └── panel chatu (Next.js, useKecaloChat, /api/chat …)
```

Komunikace mezi rámem a hostitelskou stránkou je jednosměrná a minimální:
widget pošle `postMessage` „zavři mě", `embed.js` schová iframe. Nic víc
protokol neobsahuje.

### Proč bublina mimo iframe

Dřív jsem doporučoval opak (bublina uvnitř iframu, aby ji nerozbilo cizí CSS).
**Měním to** — closed shadow DOM tu námitku ruší úplně (styly hostitele dovnitř
nedosáhnou a naše ven taky ne) a lazy iframe přináší dvě věci, které za to
stojí:

- **Pasivní návštěvník stáhne ~4 KB, ne celý Next.js bundle.** Drtivá většina
  návštěvníků cizího webu chat nikdy neotevře.
- **Dokud nikdo neklikne, nevznikne žádný požadavek na Kecalo.** To souvisí
  s nákladovou obavou, kvůli které vznikl ochranný plán.

Cenou je, že bublina se musí nastylovat ručně v `embed.js` (nemá k dispozici
Tailwind ani design tokeny z `globals.css`) — je to jedno tlačítko, tedy
~30 řádků CSS, ale barva akcentu `#D85A30` se tím **duplikuje mimo
`globals.css`**. Zapsat to do `embed.js` jako komentář s odkazem na zdroj
pravdy, jinak se to jednou rozejde.

### Proč iframe zůstává namountovaný po zavření

Stejný důvod jako u dnešního panelu: konverzace i běžící stream mají přežít
zavření. Zavření tedy není `display:none` ani odebrání elementu, ale
`opacity: 0; pointer-events: none` + `transform` — přesně technika, kterou už
`ChatWidget.tsx` používá interně. `pointer-events: none` je tu povinné, jinak
by neviditelný rám dál blokoval kliknutí do webu zákazníka.

### Proč iframe a ne přímé volání API z cizí stránky

Uvnitř iframu je origin pořád Kecalo, takže `fetch("/api/chat")` je
**same-origin** — žádné CORS, žádné preflighty a etapa C ochranného plánu
(allowlist originů) embed nerozbije, protože `Origin` bude vlastní doména.
Varianta „widget běží přímo v DOM hostitele" by znamenala otevřít API cizím
originům, což je výrazně větší útočná plocha za velmi malý zisk.

---

## Odsouhlasená rozhodnutí

1. **Bublinu kreslí `embed.js`** v closed shadow DOM; iframe se vytváří lazy
   při prvním otevření a pak už zůstává.
2. **Allowlist domén je vlastní proměnná `WIDGET_ALLOWED_ORIGINS`**, ne sdílení
   `ALLOWED_ORIGINS` z ochranného plánu. Jsou to dvě různé otázky — „kdo mě smí
   vložit do rámu" vs. „kdo smí volat moje API" — a při iframe architektuře je
   druhá množina prázdná. Sloučit je by znamenalo tiše povolit i přímá API
   volání z webu zákazníka.
3. **`X-Frame-Options` se pro `/widget` vynechá.** Hlavička neumí seznam domén
   (`ALLOW-FROM` je mrtvé, prohlížeče ho ignorují), takže jediná možnost je
   nechat práci na `frame-ancestors`. Zbytek aplikace si `DENY` ponechá.

---

## Milník 1 — routa `/widget`

- [ ] **1.1** Rozdělit `ChatWidget.tsx` na dvě komponenty **doslovným
  přesunem**, ne přepisem:
  - `src/components/ChatPanel.tsx` — samotný panel (hlavička, `ChatMessages`,
    vstupní lišta, disclaimer) + `useKecaloChat()`. Props: `onClose: () => void`
    a `variant: "floating" | "full"` (floating = dnešní `h-[600px] w-[380px]`
    se zaoblením a stínem; full = `h-dvh w-full` bez zaoblení — v iframu
    zaoblení a stín kreslí `embed.js` na samotném rámu).
  - `ChatWidget.tsx` zůstává jako obal pro `/demo`: bublina + `<ChatPanel
    variant="floating" />` + logika `open`/`inert`/Escape.
  - Riziko regrese na `/demo` je stejné jako u milníku 1 fáze 1 — proto
    kontrolní bod 1.5 **před** psaním `embed.js`.
- [ ] **1.2** Nová `src/app/widget/page.tsx`: `<ChatPanel variant="full" />`,
  `metadata.robots = { index: false, follow: false }` (rám na cizím webu nemá
  co dělat ve vyhledávači a duplicitní obsah vůči `/` je zbytečný).
  Tlačítko `Minus` v hlavičce se ve variantě `full` chová jako „zavřít" —
  pošle rodiči `postMessage({ source: "kecalo", type: "close" }, "*")`.
  > `targetOrigin: "*"` je tu v pořádku: zpráva nenese žádná data, jen signál.
  > Ověřování směrem ven by znamenalo znát origin hostitele, což rám neví.
- [ ] **1.3** `src/proxy.ts`: přidat `/widget` do `config.matcher`
  i do `PUBLIC_CHAT_PATHS`. Fail-closed chování zůstává — v interním režimu
  je `/widget` chráněná stejně jako `/`.
- [ ] **1.4** Interní režim nesmí skončit prázdným rámem: redirect na
  `/admin/login` se v iframu nevykreslí (login má `frame-ancestors 'none'`),
  takže návštěvník cizího webu uvidí bílé nic. Proxy proto pro `/widget`
  místo redirectu vrátí `rewrite` na jednoduchou stránku „Chat je dostupný
  jen po přihlášení" — vykreslí se uvnitř rámu a je z ní poznat, co se stalo.
- [ ] **1.5** Kontrolní bod: `npm run lint`, `npm run build`; na `/demo`
  ověřit, že se widget chová **identicky** jako před rozdělením (stream,
  zdroje, karta poptávky, palce, persistence přes minimalizaci); `/widget`
  otevřít přímo v prohlížeči — panel vyplní okno.

## Milník 2 — `public/embed.js`

Prostý JS bez build kroku a bez závislostí (soubor v `public/` neprochází
bundlerem). Cílová velikost do 5 KB nekomprimovaně.

- [ ] **2.1** Odvození originu z vlastního `<script>` tagu
  (`document.currentScript.src`), aby konfigurace na straně zákazníka byla
  právě jeden řádek:
  ```html
  <script src="https://kecalo-klient.vercel.app/embed.js" defer></script>
  ```
  Fallback pro případ, že `currentScript` chybí (dynamické vkládání):
  najít `script[src$="/embed.js"]`.
- [ ] **2.2** Idempotence: druhé vložení téhož skriptu nesmí vytvořit druhou
  bublinu — guard přes `window.__kecaloWidget`.
- [ ] **2.3** Kořen `<div id="kecalo-widget">` + `attachShadow({ mode: "closed" })`,
  `position: fixed; bottom: 16px; right: 16px; z-index: 2147483000`.
  Uvnitř shadow rootu `<style>` s bublinou (56 px, `#D85A30`, stín, ikona jako
  inline SVG — `lucide-react` tu není k dispozici) a `aria-label="Otevřít chat"`
  + `aria-expanded`.
- [ ] **2.4** Lazy iframe: při prvním kliknutí vytvořit
  `<iframe src="<origin>/widget" title="Chat">`, `border: 0`,
  `border-radius: 16px`, `box-shadow`, rozměry `380×600` s `max-height`
  odvozenou od viewportu (stejný výpočet jako dnešní panel — musí zbýt místo
  na bublinu). Zaoblení na rámu obsah ořízne, takže panel uvnitř žádné mít
  nemusí.
- [ ] **2.5** Zavírání: klik na bublinu, zpráva `kecalo:close` z rámu
  (s kontrolou `event.origin === widgetOrigin` — **tady se origin ověřuje**,
  na rozdíl od odchozí zprávy) a `Escape` **na hostitelské stránce**.
  Escape uvnitř rámu si řeší panel sám; hostitelský listener je potřeba pro
  případ, kdy fokus zůstal mimo rám.
- [ ] **2.6** Mobil: pod 480 px iframe přes celý viewport
  (`inset: 0; width: 100%; height: 100%; border-radius: 0`), bublina skrytá
  při otevřeném chatu — na malém displeji nemá kam uhnout.
- [ ] **2.7** Respektovat `prefers-reduced-motion` (bez transitionu).

## Milník 3 — bezpečnostní hlavičky

- [ ] **3.1** `next.config.ts`: rozdělit `headers()` na dvě položky.
  - `source: "/((?!widget).*)"` → dnešní `SECURITY_HEADERS` beze změny.
  - `source: "/widget"` → `X-Content-Type-Options`, `Referrer-Policy`
    a `Content-Security-Policy: frame-ancestors <seznam>`; **bez**
    `X-Frame-Options`.
  > Negativní lookahead v `source` je nejkřehčí místo celého plánu — musí se
  > ověřit `curl -I` na obou skupinách rout (bod 4.1), ne odhadem.
- [ ] **3.2** Seznam z `WIDGET_ALLOWED_ORIGINS` (čárkou oddělené originy).
  **Prázdná nebo chybějící proměnná = `frame-ancestors 'none'`**, tedy dnešní
  chování. Zapnutí embedu je vědomý krok, ne důsledek nasazení — stejná logika
  jako u `PUBLIC_CHAT` a `retention_enabled`.
  > Hodnota se čte při buildu, takže přidání domény zákazníka vyžaduje
  > redeploy. Na Vercelu to není omezení navíc — změna env proměnné se stejně
  > projeví až redeploym.
- [ ] **3.3** `.env.example` + tabulka proměnných v `CLAUDE.md`.

## Milník 4 — E2E ověření

Klíčové je testovat **z jiného originu**, jinak se cross-origin chování
neověří vůbec. Hostitelská stránka: statické HTML ve scratchpadu, servírované
`npx serve -l 8080` → `http://localhost:8080` vs. dev server na `:3000`.

- [ ] **4.1** `curl -I` na `/`, `/demo`, `/admin/login` → `X-Frame-Options: DENY`
  a `frame-ancestors 'none'`; `curl -I /widget` → **žádné** `X-Frame-Options`
  a `frame-ancestors` se seznamem. Bez tohohle bodu nemá zbytek smysl měřit.
- [ ] **4.2** `WIDGET_ALLOWED_ORIGINS` **nenastavená** → rám na testovací
  stránce se nevykreslí a konzole hlásí porušení CSP. Ověřuje fail-closed
  default; snadno se přehlédne, protože „vypadá to rozbitě" je tu správný
  výsledek.
- [ ] **4.3** Se seznamem obsahujícím `http://localhost:8080` → bublina,
  klik → panel, dotaz → stream + `SourcesBlock`.
- [ ] **4.4** Produktový dotaz → karta poptávky, token `[[NABIDKA]]`
  neprobliká; odeslání poptávky projde (`POST /api/leads` 200).
- [ ] **4.5** Zavřít a znovu otevřít během streamu → odpověď kompletní,
  rozepsaný vstup zachovaný (iframe zůstal namountovaný).
- [ ] **4.6** Zavřený widget **neblokuje kliknutí** do hostitelské stránky
  v místě, kde rám leží (odkaz pod ním musí jít kliknout).
- [ ] **4.7** Cizí CSS na hostitelské stránce (`* { box-sizing: content-box }`,
  `button { all: unset }`, agresivní `z-index`) bublinu nerozbije — to je
  hlavní důvod pro shadow DOM.
- [ ] **4.8** Mobilní šířka 375 px → panel přes celý viewport, bez
  horizontálního scrollu.
- [ ] **4.9** Dvojí vložení `<script>` → jedna bublina (bod 2.2).
- [ ] **4.10** Regrese `/demo` a `/` — po rozdělení komponenty beze změny
  chování.
- [ ] **4.11** Interní režim (`PUBLIC_CHAT` nenastavená): rám ukáže hlášku
  z bodu 1.4, ne prázdno.

## Milník 5 — dokumentace a uzavření

- [ ] **5.1** Nový `docs/widget-embed.md` — návod pro zákazníka: jeden
  `<script>` tag, co doplnit na straně Kecala (`WIDGET_ALLOWED_ORIGINS`),
  co dělat, když má zákazník vlastní CSP (viz Rizika), a jak poznat, že to
  nefunguje kvůli `frame-ancestors`.
- [ ] **5.2** `CLAUDE.md`: routa `/widget` a `public/embed.js` v seznamu
  stránek a v adresářové struktuře, `WIDGET_ALLOWED_ORIGINS` v tabulce env,
  věta ve Stavu projektu. `docs/ARCHITECTURE.md` dtto.
- [ ] **5.3** Zaškrtat tento plán, doplnit sekci Stav a v
  `widget_mini_kecalo_plan.md` přepsat „Co ve fázi 2 zbývá" na hotovo
  s odkazem sem.
- [ ] **5.4** Commit + push.

---

## Rizika a poznámky

- **Vlastní CSP na webu zákazníka.** Má-li zákazník `Content-Security-Policy`
  se `script-src` nebo `frame-src`, embed neprojde, dokud si tam nedoplní naši
  doménu. Tohle je nejčastější důvod, proč embed „nejde" — patří na první místo
  návodu v 5.1, ne do sekce řešení potíží na konci.
- **`localStorage` se ve třetí straně partition-uje.** `kecalo_session_id`
  bude v rámu na `klient.cz` jiné než na `kecalo-klient.vercel.app`. Pro účel
  (jedna „osoba" = jedna session) je to spíš správně, ale znamená to, že
  session id **nelze** použít k propojení návštěvy napříč weby — a v prohlížeči
  s blokovaným úložištěm třetích stran `getSessionId()` hodí výjimku. Ošetřit
  try/catch s fallbackem na id v paměti; dnes je `getSessionId()` bez ochrany,
  protože běželo jen first-party.
- **Cache `embed.js`.** Soubory z `public/` servíruje Vercel s dlouhou
  cache-control. Změna skriptu se u zákazníků projeví se zpožděním — proto
  má být `embed.js` co nejhloupější a veškerá logika co může být v `/widget`
  (ta se nekešuje stejně). Verzování přes `embed.js?v=2` je až nouzové řešení.
- **Duplicitní barva akcentu** v `embed.js` mimo `globals.css` (viz výše).
- **Bez ochranného plánu je embed nákladově nekrytý.** Viz níže.

## Vztah k ochrannému plánu

[`public_chat_protection_plan.md`](public_chat_protection_plan.md) je technicky
nezávislý — tenhle plán se dá udělat bez něj a naopak. Závislost je provozní:
jakmile widget visí na cizím webu, `/api/chat` odbavuje návštěvníky, které
neuvidíš, a dnešní rate limit počítá per instance, takže na Vercelu žádný
skutečný strop není.

Doporučené pořadí: **etapa B ochranného plánu (denní strop útraty) před
ostrým nasazením embedu.** Etapy A a C jsou žádoucí, ale ne blokující — etapa C
navíc embed nijak neomezuje, protože API volání z rámu jsou same-origin.

Pro embed na jeden web, který máš pod kontrolou (vlastní prezentace, klientské
demo), lze fázi 2 udělat rovnou.

## Co plán vědomě neřeší

- **Multi-tenance.** Instance je single-tenant (jedna tabulka `documents`,
  jeden řádek `app_settings`), takže druhá znalostní báze = druhé nasazení.
  Sdílená instance pro víc zákazníků se dotýká retrievalu, oprávnění
  i účtování — vlastní projekt.
- **Konfigurace vzhledu ze strany zákazníka** (barva, pozice, uvítací text
  přes `data-*` atributy skriptu). Přidatelné později, protokol na to má místo.
- **Proaktivní otevření** („po 30 s vyskočí bublina s pozdravem") — obtěžující
  vzor, zavádět jen na výslovné přání.
- **Serverová historie konverzace** — refresh stránky chat maže, stejně jako
  dnes (odložený dluh SEC-7).
- **Předvyplnění kontextu z hostitelské stránky** (URL, název produktu).
  Znamenalo by přijímat data z cizí stránky přes `postMessage` — nový
  nedůvěryhodný vstup do promptu, tedy vlastní bezpečnostní rozvaha.
- **Ochrana nákladů** — viz ochranný plán.

## Stav

- **Návrh — neimplementováno.** Vypracováno 7. 9. 2026.
