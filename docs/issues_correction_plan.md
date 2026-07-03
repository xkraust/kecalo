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

### B1. Validace vstupu a limity `/api/chat` (#2) 🔴

**Soubor:** `src/app/api/chat/route.ts`

- [ ] Validační funkce na začátku handleru: tělo musí být objekt s polem `messages`; každá zpráva objekt s `role ∈ {"user","assistant"}` a řetězcovým `content`; jinak 400 s českou hláškou (žádný `TypeError` → 500).
- [ ] Limity: `content` jedné zprávy max 4 000 znaků (delší → 400), celkový počet zpráv před ořezem max 50 (ochrana proti obřímu JSON), JSON body parse s `.catch(() => null)` → 400.
- [ ] Rate limit: sdílený in-memory helper (nový `src/lib/rate-limit.ts`, sliding window per IP z hlavičky `x-forwarded-for`), např. 20 požadavků/min na `/api/chat`. Použít i pro `/api/feedback` (D1) a login (A2). Komentářem zdokumentovat per-instance omezení na serverless.

**Ověření:** `curl` s tělem `{}`, `{"messages":"x"}`, `{"messages":[{"role":"system","content":"x"}]}` → vždy 400; validní dotaz → stream OK; 21. požadavek v minutě → 429.

### B2. Omezení velikosti `X-Sources` (#7) 🟠

**Soubor:** `src/app/api/chat/route.ts`

- [ ] Před serializací oříznout `section` na 100 znaků a `filename` na 80 znaků (s `…`).
- [ ] Pojistka: pokud URL-encoded JSON přesáhne 8 000 znaků, poslat zdroje bez pole `section` (filename + page + similarity stačí pro zobrazení).

**Ověření:** dotaz s `top_k = 20` v `/admin/parameters` → odpověď má hlavičku < 8 KB a blok zdrojů se v chatu vykreslí.

### B3. Fallback bez volání Claude (#8) 🟡

**Soubory:** `src/app/api/chat/route.ts`, `src/lib/rag/prompts.ts`

- [ ] Větev `chunks.length === 0`: místo `streamText` vrátit přímo `new Response(FALLBACK_MESSAGE, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Sources": … } })` — klient čte tělo readerem, plain text mu nevadí.
- [ ] Span `chat-pipeline` ukončit hned (endSpan(true)) s atributem `retrieval.is_fallback = true`; `after(flushTelemetry)` zachovat.

**Ověření:** otázka mimo bázi (testovací otázky v `docs/testovaci_otazky*.md`) → doslovná fallback hláška, prázdné zdroje, v Langfuse trace bez LLM spanu, odpověď < 1 s.

### B4. Model a baseURL do configu (#9) 🟡

**Soubory:** `src/lib/config.ts`, `src/app/api/chat/route.ts`

- [ ] Do `config` přidat `chatModel: process.env.CHAT_MODEL ?? "claude-sonnet-4-6"`; v chat route použít `anthropic(config.chatModel)` na obou místech (po B3 zbude jen jedno).
- [ ] Odstranit `baseURL` z `createAnthropic` (SDK má správný default), případně celý `createAnthropic` nahradit importem defaultního `anthropic` provideru.

---

## Balíček C — Integrita indexace (vysoká #4, #5)

### C1. Reindexace bez ztráty dat (#4) 🟠

**Soubory:** nová migrace `supabase/migrations/009_chunk_batch.sql`, `src/lib/rag/pipeline.ts`

- [ ] Migrace 009: `chunks += batch_id uuid NOT NULL DEFAULT gen_random_uuid()`. `match_chunks` beze změny (během zpracování je dokument ve stavu `processing`, retrieval ho nevrací — okno nekonzistence nevzniká).
- [ ] `pipeline.ts` — otočit pořadí: vygenerovat `batchId` → **nejdřív vložit** nové chunky (všechny dávky se stejným `batch_id`) → **pak smazat** staré (`document_id = X AND batch_id != batchId`) → nastavit `status = ready`. Selhání při insertu → staré chunky zůstávají netknuté; uklidit částečně vložený nový batch (`delete … batch_id = batchId`) v catch větvi.
- [ ] Kontrolovat `error` u všech `update` statusů dokumentu (řádky, kde se dnes výsledek zahazuje) — při selhání alespoň `console.error`, u přechodu na `ready` chybu propagovat (jinak dokument zamrzne v `processing` bez informace).

**Ověření:** reindexace M-100 přes admin UI → stejný počet chunků jako před změnou (57), `docs/testovaci_otazky*.md` přes test retrievalu → shodná top similarity. Simulace selhání (dočasně vyhozená výjimka mezi dávkami insertu) → původní chunky přežijí, status `error`.

### C2. Atomický přechod stavu při reprocess (#5) 🟠

**Soubor:** `src/app/api/documents/[id]/reprocess/route.ts`

- [ ] Nahradit dvojici select+update jedním podmíněným updatem: `.update({ status: "processing", error_message: null }).eq("id", id).in("status", ["ready", "error"]).select("id")` — když vrátí 0 řádků, rozlišit 404 (dokument neexistuje — druhý select) vs. 409 (právě se zpracovává).

**Ověření:** dvě rychlá volání reprocess za sebou (curl) → první 200, druhé 409; po doběhnutí je dokument `ready` se správným počtem chunků.

---

## Balíček D — Menší opravy API (vysoká #6, nekritické #13, #14, #15)

### D1. Limity `/api/feedback` (#6) 🟠

**Soubor:** `src/app/api/feedback/route.ts`

- [ ] `sessionId`: max 64 znaků (delší → 400). `messageIndex`: `Number.isInteger` a rozsah 0–10 000 (jinak 400 — žádný int4 overflow → 500). `query`: oříznout na 2 000 znaků (`slice`, neodmítat).
- [ ] Napojit rate limit helper z B1 (např. 10 požadavků/min na IP).

### D2. Skutečná kontrola chyb supabase volání (#13) 🟡

**Soubory:** `src/app/api/documents/route.ts`, `src/app/api/documents/[id]/route.ts`

- [ ] Odstranit no-op `.catch(() => {})`, číst `error` z výsledku: u `createBucket` ignorovat jen chybu „already exists", jiné logovat; u `storage.remove` při mazání dokumentu chybu zalogovat (`console.warn` — osiřelý soubor, mazání záznamu pokračuje).

### D3. Kontrola duplicitního filename při uploadu (#14) 🟡

**Soubor:** `src/app/api/documents/route.ts`

- [ ] Před insertem dotaz na existující `filename`; při shodě 409 s hláškou „Dokument s tímto názvem už existuje — nejdřív ho smažte, nebo soubor přejmenujte." Ověřit, že `UploadZone`/`documents/client.tsx` hlášku z API zobrazí.

### D4. Povinné API klíče (#15) 🟡

**Soubor:** `src/lib/config.ts`

- [ ] `anthropicApiKey` a `voyageApiKey` převést na `required()` — CLAUDE.md je už vede jako povinné. (Middleware `config.ts` neimportuje, edge build to neovlivní.)

---

## Balíček E — Klient a drobnosti (nekritické #10, #11, #12)

### E1. Robustní detekce chyb Voyage (#10) 🟡

**Soubor:** `src/lib/rag/embed.ts`

- [ ] Číst `statusCode` a `body` z chybového objektu SDK (fern klient je vystavuje) místo `message.includes("429")`; sniffing textu ponechat jen jako fallback. Detekci „payment method" hledat v `body` odpovědi.

### E2. Escapování `source` atributu (#11) 🟡

**Soubor:** `src/lib/rag/prompts.ts`

- [ ] V `buildContextBlock` nahradit `"` → `&quot;` (příp. `<`/`>` → entity) v hodnotě `source`, aby název souboru nemohl rozbít strukturu `<document>` bloků.

### E3. Chat klient (#12) 🟡

**Soubor:** `src/app/page.tsx`

- [ ] Po `done` doplnit závěrečný `decoder.decode()` (flush posledního vícebajtového znaku).
- [ ] `AbortController` na request: „Nová konverzace" a unmount komponenty běžící fetch zruší (`AbortError` v catch ignorovat, ne zobrazovat jako výpadek služby).
- [ ] Feedback: `query` brát ze zprávy `messages[messageIndex - 1]` (je-li `role === "user"`), ne z posledního dotazu konverzace.

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
