# Implementační plán oprav nálezů z code_check.md

Navazuje na revizi [code_check.md](code_check.md) (3. 7. 2026, 15 nálezů). Opravy jsou seskupeny do pěti balíčků A–E podle souvislosti a řazeny podle priority: nejdřív kritické (A1, B1), pak vysoká důležitost, nakonec nekritické. Každý balíček je samostatně commitovatelný a ověřitelný. Čísla v závorkách odkazují na nálezy v code_check.md.

**Zásady:** žádné nové závislosti (validace ručně, ne Zod), změny DB výhradně přes migrace v `supabase/migrations/`, rozsahy validace držet v `src/lib/settings-meta.ts` tam, kde už existují. Po dokončení aktualizovat CLAUDE.md (sekce Architektura, Admin autentizace, produkční dluh) a tento plán (zaškrtávat hotové kroky).

---

## Balíček A — Zabezpečení admin API a session (kritické #1, vysoká #3)

### A1. Ochrana admin API rout middlewarem (#1) 🔴 ✅ HOTOVO

**Soubor:** `src/middleware.ts`

- [x] Rozšířit `config.matcher` o admin API routy: `/api/documents/:path*`, `/api/settings`, `/api/retrieval-test` (a ponechat `/admin`, `/admin/:path*`). Veřejné zůstávají: `/api/chat`, `/api/feedback`, `/api/auth/*`.
- [x] V middlewaru rozlišit typ požadavku: pro cesty začínající `/api/` vracet při neplatné session `NextResponse.json({ error: "Nepřihlášen" }, { status: 401 })` místo redirectu na login (redirect je pro API nesmyslný).
- [x] Admin klientské komponenty (`documents/client.tsx`, `parameters/client.tsx`, retrieval-test) ověřeno: na 401 reagují rozumně (parameters a retrieval-test zobrazí hlášku z API, documents tiše ponechá stará data) — úprava nebyla potřeba.

**Ověření:** ✅ provedeno — bez cookie vrací všech 6 chráněných rout (GET/POST documents, DELETE, reprocess, GET/POST settings, retrieval-test) 401; `/api/chat`, `/api/feedback` a `/api/auth/login` zůstávají veřejné (400 = validace, ne auth); po loginu s cookie routy vracejí 200; `/admin` bez cookie přesměruje na login; lint i build bez chyb.

### A2. Zpevnění session tokenu a loginu (#3) 🟠 ✅ HOTOVO

**Soubory:** `src/lib/auth.ts`, `src/middleware.ts`, `src/lib/config.ts`, `src/app/api/auth/login/route.ts`, `.env.example`

- [x] Nová env proměnná `SESSION_SECRET` (dlouhý náhodný řetězec): přidána do `.env.example`, do `config.ts` jako `required()`, doplněna do tabulky env v CLAUDE.md. **Na Vercelu nutno nastavit před nasazením!** Podpisový klíč HMAC = `SESSION_SECRET` (už ne `ADMIN_PASSWORD`) → uniklá cookie neumožní brute-force hesla.
- [x] Do podepisovaných dat přidán náhodný nonce: cookie `ts.nonce.sig`, podpis přes `ts.nonce` (tokeny přestaly být deterministické).
- [x] Ověření podpisu přes `crypto.subtle.verify("HMAC", key, sig, data)` místo porovnání hex řetězců — verify je constant-time a funguje i v edge runtime middlewaru.
- [x] `middleware.ts`: při chybějícím `SESSION_SECRET` přístup zamítá (deny + console.error), nikdy nepadá na prázdný secret.
- [x] Login rate limit: in-memory mapa `IP → {count, windowStart}` v module scope routy, max 5 pokusů / 15 min, při překročení 429; úspěšný login počítadlo nuluje. (Per-instance limit — na serverless zmírnění, ne absolutní ochrana; zdokumentováno v komentáři.)
- [x] Porovnání username/hesla v login routě přes constant-time helper `safeEqual` (SHA-256 otisky + XOR porovnání pevné délky; obě porovnání běží vždy, bez short-circuit).
- [x] Logout bez server-side invalidace ponechán jako dokumentované omezení prototypu; `SESSION_MAX_AGE` zkrácen z 24 h na 8 h.

**Ověření:** ✅ provedeno — podvržená cookie starého formátu (`ts.sig`) → 401; login se správnými údaji → 200, cookie má formát `ts.nonce.sig` (3 části) a chráněné routy s ní vracejí 200; 6 špatných pokusů → 5× 401, poté 429; lint i build bez chyb. `SESSION_SECRET` vygenerován do `.env.local` (64 hex znaků, nezobrazen v přepisu).

---

## Balíček B — Robustnost chat API (kritické #2, vysoká #7, nekritické #8, #9)

### B1. Validace vstupu a limity `/api/chat` (#2) 🔴 ✅ HOTOVO

**Soubory:** `src/app/api/chat/route.ts`, `src/lib/rate-limit.ts` (nový)

- [x] Validační funkce `parseMessages` na začátku handleru: tělo musí být objekt s polem `messages`; každá zpráva objekt s `role ∈ {"user","assistant"}` a řetězcovým `content`; jinak 400 s českou hláškou (žádný `TypeError` → 500). Odpadl nekontrolovaný cast `m.role as …`.
- [x] Limity: `content` jedné zprávy max 4 000 znaků (delší → 400), celkový počet zpráv před ořezem max 50, JSON body parse s `.catch(() => null)` → 400.
- [x] Rate limit: sdílený in-memory helper `src/lib/rate-limit.ts` (`createRateLimiter` — sliding window per klíč, `clientIp` z `x-forwarded-for`, pojistka MAX_KEYS proti růstu mapy), 20 požadavků/min na `/api/chat` → 429. Login (A2) sdílí `clientIp`, ale záměrně si nechává vlastní počítadlo **neúspěšných pokusů** (úspěšný login se nepočítá a nuluje) — jiná sémantika než počítání požadavků. `/api/feedback` se napojí v D1. Per-instance omezení na serverless zdokumentováno v komentáři.

**Ověření:** ✅ provedeno — těla `{}`, `{"messages":"x"}`, role `system`, nečíselný content, content 4 001 znaků i nevalidní JSON → vše 400; validní dotaz → 200, stream + `X-Sources`; 25 rychlých požadavků → po vyčerpání 20/min okna 429; po vypršení okna se limiter zotaví (dotaz z UI prošel a vykreslil odpověď se zdroji); lint i build bez chyb.

### B2. Omezení velikosti `X-Sources` (#7) 🟠 ✅ HOTOVO

**Soubor:** `src/app/api/chat/route.ts`

- [x] Před serializací se ořezává `section` na 100 znaků a `filename` na 80 znaků (s `…`) — helper `buildSourcesHeader`.
- [x] Pojistka: pokud URL-encoded JSON přesáhne 8 000 znaků, pošlou se zdroje bez pole `section` (filename + page + similarity stačí pro zobrazení). Nejhorší případ je tím omezen bezpečně pod limit hlaviček.

**Ověření:** ✅ provedeno — dočasně `top_k = 20` (přes API s cookie, poté obnoveno na 5): odpověď vrátila 20 zdrojů, hlavička 6 791 znaků (< 8 000), sekce ≤ 100 znaků; lint i build bez chyb.

### B3. Fallback bez volání Claude (#8) 🟡 ✅ HOTOVO

**Soubor:** `src/app/api/chat/route.ts`

- [x] Větev `chunks.length === 0`: místo `streamText` se vrací přímo `new Response(FALLBACK_MESSAGE, …)` s `text/plain; charset=utf-8` a prázdným `X-Sources` — klient čte tělo readerem, plain text mu nevadí.
- [x] Span `chat-pipeline` se ukončí hned (`endSpan(true)`) s atributem `retrieval.is_fallback = true`; `after(flushTelemetry)` zachován.

**Ověření:** ✅ provedeno — s dočasným prahem 0,99 (poté obnoven na 0,35): odpověď je doslovná fallback hláška, `X-Sources: []`, `text/plain`, bez volání Claude.

### B4. Model a baseURL do configu (#9) 🟡 ✅ HOTOVO

**Soubory:** `src/lib/config.ts`, `src/app/api/chat/route.ts`, `.env.example`

- [x] Do `config` přidán `chatModel: process.env.CHAT_MODEL ?? "claude-sonnet-4-6"`; chat route používá `anthropic(config.chatModel)` (po B3 jediné místo). `CHAT_MODEL` doplněn do `.env.example` jako volitelný.
- [x] `createAnthropic` s hardcoded `baseURL` nahrazen importem defaultního `anthropic` provideru.

**Ověření:** ✅ běžný dotaz → 200, stream, 2 zdroje (model z configu funguje).

---

## Balíček C — Integrita indexace (vysoká #4, #5)

### C1. Reindexace bez ztráty dat (#4) 🟠 ✅ HOTOVO

**Soubory:** nová migrace `supabase/migrations/009_chunk_batch.sql`, `src/lib/rag/pipeline.ts`

- [x] Migrace 009: `chunks += batch_id uuid NOT NULL DEFAULT gen_random_uuid()`. `match_chunks` beze změny (během zpracování je dokument ve stavu `processing`, retrieval ho nevrací — okno nekonzistence nevzniká). **Aplikována na Supabase** (`supabase db push` provedl uživatel).
- [x] `pipeline.ts` — otočené pořadí: vygenerovat `batchId` → **nejdřív vložit** nové chunky (všechny dávky se stejným `batch_id`) → **pak smazat** staré (`document_id = X AND batch_id != batchId`, jeden atomický příkaz) → nastavit `status = ready`. Selhání před výměnou → úklid částečně vloženého nového batche v catch, staré chunky netknuté; po výměně se nový batch nechává (jediná kompletní kopie).
- [x] Kontroluje se `error` u všech `update` statusů dokumentu — selhání přechodu na `ready` se propaguje (jinak by dokument zamrzl v `processing` bez informace), ostatní alespoň `console.error`.

**Ověření:** ✅ provedeno na IPID (2 chunky) — úspěšná reindexace: `ready`, 2 chunky, jediný nový `batch_id`; simulace selhání (dočasný `throw` mezi insertem a výměnou): status `error` s hláškou, **původní 2 chunky s původním batch_id přežily**, nový batch uklizen; po odstranění chyby reindexace zpět do `ready`. Kontrolní retrieval identický s baseline (top-5 similarity 0,4433 / 0,4314 / 0,4291 / 0,4276 / 0,4267). Lint i build bez chyb.

### C2. Atomický přechod stavu při reprocess (#5) 🟠 ✅ HOTOVO

**Soubor:** `src/app/api/documents/[id]/reprocess/route.ts`

- [x] Dvojice select+update nahrazena jedním podmíněným updatem: `.update({ status: "processing", error_message: null }).eq("id", id).in("status", ["ready", "error"]).select("id")` — když vrátí 0 řádků, rozlišuje se 404 (dokument neexistuje — druhý select) vs. 409 (právě se zpracovává).

**Ověření:** ✅ provedeno — dvě rychlá volání za sebou: první 200, druhé 409 „Dokument se právě zpracovává"; neexistující id → 404; po doběhnutí dokument `ready` se správným počtem chunků. (Pozn.: při testování bylo nutné smazat `.next` cache — dev server po dřívějším křížení s `next build` nezaregistroval vnořenou routu a vracel HTML 404.)

---

## Balíček D — Menší opravy API (vysoká #6, nekritické #13, #14, #15)

### D1. Limity `/api/feedback` (#6) 🟠 ✅ HOTOVO

**Soubor:** `src/app/api/feedback/route.ts`

- [x] `sessionId`: max 64 znaků (delší → 400). `messageIndex`: `Number.isInteger` a rozsah 0–10 000 (jinak 400 — žádný int4 overflow → 500). `query`: oříznut na 2 000 znaků (`slice`, neodmítá se).
- [x] Napojen rate limit helper z B1: 10 požadavků/min na IP → 429.

**Ověření:** ✅ provedeno — sessionId 65 znaků, messageIndex 10^15 i 3,5, rating „maybe" → vše 400; validní hlas → 200 (testovací řádek poté smazán z DB); 11. požadavek v minutě → 429.

### D2. Skutečná kontrola chyb supabase volání (#13) 🟡 ✅ HOTOVO

**Soubory:** `src/app/api/documents/route.ts`, `src/app/api/documents/[id]/route.ts`

- [x] Odstraněny no-op `.catch(() => {})`, čte se `error` z výsledku: u `createBucket` se ignoruje jen „already exists" (jiné → `console.warn`); u `storage.remove` při mazání dokumentu se chyba loguje (`console.warn` — osiřelý soubor, mazání záznamu pokračuje).

**Ověření:** ✅ upload i delete prošly bez warningů v logu; delete odstranil soubor ze Storage i záznam.

### D3. Kontrola duplicitního filename při uploadu (#14) 🟡 ✅ HOTOVO

**Soubor:** `src/app/api/documents/route.ts`

- [x] Před insertem dotaz na existující `filename`; při shodě 409 s hláškou „Dokument s tímto názvem už existuje — nejdřív ho smažte, nebo soubor přejmenujte." (`UploadZone` hlášku z API zobrazuje — `data.error`.)

**Ověření:** ✅ upload `test-duplicity-d3.txt` → 201, druhý stejný → 409, úklid delete → 200; v DB ani Storage nezůstaly zbytky.

### D4. Povinné API klíče (#15) 🟡 ✅ HOTOVO

**Soubor:** `src/lib/config.ts`

- [x] `anthropicApiKey` a `voyageApiKey` převedeny na `required()` — CLAUDE.md je už vede jako povinné. (Middleware `config.ts` neimportuje, edge build to neovlivnilo — build OK.)

---

## Balíček E — Klient a drobnosti (nekritické #10, #11, #12)

### E1. Robustní detekce chyb Voyage (#10) 🟡 ✅ HOTOVO

**Soubor:** `src/lib/rag/embed.ts`

- [x] Čte se `statusCode` a `body` z chybového objektu SDK (`statusCodeOf`/`errorTextOf`); sniffing textu zprávy zůstal jen jako fallback. Detekce „payment method" prohledává i `body` odpovědi.

### E2. Escapování `source` atributu (#11) 🟡 ✅ HOTOVO

**Soubor:** `src/lib/rag/prompts.ts`

- [x] V `buildContextBlock` se hodnota `source` escapuje (`&`, `"`, `<`, `>` → entity) — název souboru nemůže rozbít strukturu `<document>` bloků.

### E3. Chat klient (#12) 🟡 ✅ HOTOVO

**Soubor:** `src/app/page.tsx`

- [x] Po `done` doplněn závěrečný `decoder.decode()` (flush posledního vícebajtového znaku).
- [x] `AbortController` na request: „Nová konverzace" i unmount komponenty běžící fetch zruší; `AbortError` se v catch ignoruje (nezobrazuje se jako výpadek služby).
- [x] Feedback: `query` se bere ze zprávy `messages[messageIndex - 1]` (je-li `role === "user"`), ne z posledního dotazu konverzace.

**Ověření E1–E3:** ✅ provedeno — E2E v prohlížeči: dvě otázky, hodnocení první odpovědi → feedback řádek nese dotaz první otázky (testovací řádek poté smazán); zrušení streamu tlačítkem „Nová konverzace" uprostřed generování → čistý prázdný stav, aktivní input, žádné chyby v konzoli; běžný chat beze změny chování. E1/E2 jsou kryty kódovou revizí (429 scénář nelze bez zásahu vyvolat). Lint i build bez chyb.

---

## Pořadí a commity

| Krok | Balíček | Závažnost | Poznámka |
|---|---|---|---|
| 1 | A1 | 🔴 | samostatný commit |
| 2 | B1 (+ `lib/rate-limit.ts`) | 🔴 | samostatný commit |
| 3 | A2 | 🟠 | vyžaduje `SESSION_SECRET` na Vercelu před nasazením |
| 4 | C1 + C2 | 🟠 | migrace 009 → `supabase db push` před nasazením kódu |
| 5 | B2 + D1 | 🟠 | |
| 6 | B3 + B4 + D2 + D3 + D4 | 🟡 | |
| 7 | E1 + E2 + E3 | 🟡 | |
| 8 | Aktualizace CLAUDE.md + code_check.md (poznámky „opraveno") | — | závěrečný commit |

## Závěrečné ověření (po všech balíčcích)

1. `npm run lint` a `npm run build` bez chyb.
2. E2E v prohlížeči: login (včetně 429 po opakovaných špatných pokusech) → dashboard → upload dokumentu (duplicitní název → chyba) → reindexace → test retrievalu → chat (věcná otázka se zdroji, fallback otázka, thumbs up/down) → změna parametrů → odhlášení.
3. Bezpečnostní smoke test curl bez cookie: `POST /api/settings`, `GET/POST /api/documents`, `DELETE /api/documents/<id>`, `POST /api/documents/<id>/reprocess`, `POST /api/retrieval-test` → vše 401; `POST /api/chat` s nevalidním tělem → 400.
4. Kontrolní měření retrievalu na `docs/testovaci_otazky*.md` — top similarity beze změny proti stavu z fáze 13 (opravy nesmí ovlivnit kvalitu RAG).
5. Langfuse: chat trace kompletní, fallback trace bez LLM spanu.
