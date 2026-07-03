# Revize kódu — code_check

**Datum revize:** 3. 7. 2026
**Rozsah:** middleware, autentizace, všechny API routy (`chat`, `documents`, `documents/[id]`, `reprocess`, `retrieval-test`, `settings`, `feedback`, `auth/login`), knihovny (`config`, `settings`, `settings-meta`, `supabase`, `telemetry`), RAG moduly (`extract`, `clean`, `chunk`, `embed`, `retrieve`, `prompts`, `pipeline`) a chat klient (`src/app/page.tsx`).

Nálezy jsou rozděleny do tří úrovní závažnosti. U každého je uveden soubor (a řádky), dopad a doporučená náprava. Projekt je prototyp — některé nálezy jsou v CLAUDE.md vedeny jako známý dluh; zde jsou uvedeny kompletně, aby byl seznam samostatně použitelný.

> **Stav (3. 7. 2026): všech 15 nálezů opraveno.** Implementace a ověření viz [issues_correction_plan.md](issues_correction_plan.md). Mapování nález → oprava: #1 → A1, #2 → B1, #3 → A2, #4 → C1, #5 → C2, #6 → D1, #7 → B2, #8 → B3, #9 → B4, #10 → E1, #11 → E2, #12 → E3, #13 → D2, #14 → D3, #15 → D4. Čísla řádků v textu níže odpovídají stavu kódu v době revize (commit `2c1ce2e`).

---

## 🔴 Kritické

### 1. Nechráněné admin API routy

**Kde:** `src/middleware.ts:4-6` (matcher pokrývá jen `/admin` a `/admin/:path*`)

Middleware chrání pouze stránky admin sekce, ale žádnou `/api/*` routu. Kdokoli bez přihlášení může:

- smazat dokumenty a jejich chunky — `DELETE /api/documents/[id]`,
- nahrát vlastní dokument do znalostní báze, a tím **otrávit odpovědi bota** — `POST /api/documents`,
- přepsat runtime parametry RAG i telemetrie — `POST /api/settings`,
- spustit reindexaci — `POST /api/documents/[id]/reprocess`,
- číst interní data (seznam dokumentů vč. chybových hlášek, výsledky retrievalu se skóre) — `GET /api/documents`, `POST /api/retrieval-test`.

**Dopad:** úplná kompromitace obsahu znalostní báze a konfigurace bez autentizace. Jde o nejzávažnější díru projektu.

**Náprava:** rozšířit matcher middlewaru o admin API routy (vše kromě `/api/chat` a `/api/feedback`), nebo v každé admin routě ověřovat session cookie přes `verifySession` z `src/lib/auth.ts`.

### 2. `/api/chat` bez validace vstupu a limitů

**Kde:** `src/app/api/chat/route.ts:27-37, 135-138`

- Chybějící nebo nevalidní `messages` (např. tělo `{}` nebo `{"messages": "x"}`) způsobí `TypeError` při `[...messages]` → neošetřená chyba 500.
- Délka obsahu jednotlivých zpráv není nijak omezena (ořezává se jen počet na 8) → klient může poslat libovolně velký prompt.
- `m.role` se přetypovává bez kontroly (`m.role as "user" | "assistant"`) — jiná hodnota projde až do AI SDK.
- Žádný rate limiting → veřejný endpoint umožňuje **nekontrolované čerpání nákladů** Claude + Voyage API (každý dotaz = embedding + LLM volání).

**Náprava:** validovat tvar těla (pole objektů se `role` ∈ {user, assistant} a řetězcovým `content`), omezit délku obsahu zprávy (např. 4 000 znaků), přidat alespoň jednoduchý rate limit (IP okno v paměti, případně Vercel WAF / Upstash).

---

## 🟠 Vysoká důležitost

### 3. Slabá konstrukce session tokenu

**Kde:** `src/lib/auth.ts`, `src/middleware.ts:18`, `src/app/api/auth/login/route.ts`

- HMAC klíč je přímo `ADMIN_PASSWORD` a podepisuje se známý plaintext (timestamp) → **uniklá cookie umožňuje offline brute-force hesla** (útočník zkouší hesla proti známému páru timestamp/podpis).
- Porovnání podpisu `sig === expected` (`auth.ts:39`) ani hesla v loginu není constant-time (timing attack).
- `middleware.ts:18` při chybějícím env tiše padá na prázdný secret (`process.env.ADMIN_PASSWORD ?? ""`), místo aby přístup zamítl.
- Login nemá rate limit (brute-force online).
- Logout jen smaže cookie — token zůstává platný do expirace (24 h), server-side invalidace neexistuje.

**Náprava:** odvodit podpisový klíč z vlastního `SESSION_SECRET` (ne z hesla), porovnávat přes `crypto.timingSafeEqual` (resp. konstantní porovnání nad Web Crypto), při chybějícím secretu v middlewaru rovnou redirectovat na login, přidat zpoždění/limit na login.

### 4. Reindexace bez transakce — možná ztráta chunků

**Kde:** `src/lib/rag/pipeline.ts:93-113`

Staré chunky se smažou (`delete`) a nové se vkládají po dávkách 100 bez transakce. Selže-li insert uprostřed (výpadek DB, překročení `maxDuration`), dokument zůstane trvale bez části (nebo všech) chunků a původní data jsou nenávratně pryč — status `error` to sice signalizuje, ale obnova vyžaduje ruční reindexaci. Navíc se nekontrolují výsledky `update` statusů (řádky 20-23, 115-123) — tiché selhání nechá dokument viset v `processing`.

**Náprava:** provést delete + insert v jedné RPC funkci (transakce v Postgresu), nebo vkládat nové chunky s dočasným příznakem a staré mazat až po úspěšném dokončení. Kontrolovat `error` u update statusů.

### 5. Race condition při reprocess/upload

**Kde:** `src/app/api/documents/[id]/reprocess/route.ts:29-43`

Kontrola `doc.status` a následný update na `processing` nejsou atomické (check-then-act přes dva dotazy). Dvě souběžná volání (nebo reprocess souběžně s dobíhajícím uploadem) spustí `processDocument` dvakrát → dva běhy si navzájem proplétají delete/insert chunků a výsledek je nedeterministický (duplicitní či chybějící chunky).

**Náprava:** podmíněný update v jednom dotazu (`update ... set status='processing' where id=? and status in ('ready','error')`) a 409 vracet, když update nezasáhl žádný řádek.

### 6. `/api/feedback` bez limitů

**Kde:** `src/app/api/feedback/route.ts`

- `query` a `sessionId` nemají omezení délky — lze ukládat MB payloady do DB.
- `messageIndex` nemá horní mez — hodnota > 2 147 483 647 přeteče int4 a vrátí 500.
- Žádný rate limit → tabulku `feedback` lze zaspamovat a znehodnotit metriku spokojenosti na dashboardu.

**Náprava:** oříznout/odmítnout `query` nad ~2 000 znaků a `sessionId` nad ~64 znaků, omezit `messageIndex` (např. `<= 10 000` + `Number.isInteger`), zvážit rate limit.

### 7. `X-Sources` hlavička může přerůst limit velikosti hlaviček

**Kde:** `src/app/api/chat/route.ts:140-145, 181-183`

Metadata zdrojů se posílají jako URL-encoded JSON v HTTP hlavičce. Při `top_k` = 20 a dlouhých `section_path` (české texty se v URL-encodingu ~3× nafouknou) může hlavička překročit limit platformy (Vercel ~16 KB na hlavičky) → server odpověď odmítne a chat přestane fungovat, přestože pipeline proběhla.

**Náprava:** posílat jen zkrácená metadata (např. section oříznout), nebo zdroje předávat v těle streamu (data part AI SDK) místo hlavičky.

---

## 🟡 Nekritické

### 8. Fallback větev volá Claude zbytečně

**Kde:** `src/app/api/chat/route.ts:90-130`

Když retrieval nic nevrátí, volá se Claude jen proto, aby doslovně opsal statickou `FALLBACK_MESSAGE`. To stojí latenci a tokeny a nese riziko, že model text nezopakuje přesně. Stačí vrátit statickou streamovanou odpověď bez LLM.

### 9. Hardcoded model a baseURL

**Kde:** `src/app/api/chat/route.ts:1-5, 92, 148`

`claude-sonnet-4-6` je natvrdo na dvou místech a `baseURL: "https://api.anthropic.com/v1"` je zbytečné (SDK má správný default). Název modelu patří do `src/lib/config.ts`, ať se mění na jednom místě.

### 10. Křehká detekce chyb Voyage API

**Kde:** `src/lib/rag/embed.ts:19-31`

Rozpoznání rate limitu přes `err.message.includes("429")` a platební chyby přes `includes("payment method")` závisí na přesném znění chybové hlášky SDK — změna formátu detekci tiše rozbije. Robustnější je číst `statusCode`/`body` z chybového objektu SDK.

### 11. Neescapované hodnoty v `source` atributu kontextu

**Kde:** `src/lib/rag/prompts.ts:31-44`

`buildContextBlock` vkládá `filename` a `section_path` do atributu `source="…"` bez escapování — uvozovka v názvu souboru rozbije pseudo-XML strukturu kontextu. Drobná plocha pro prompt injection z nahraných dokumentů (mitigováno tím, že nahrává jen admin, a instrukcí v system promptu).

### 12. Drobnosti v chat klientovi

**Kde:** `src/app/page.tsx`

- Po dostreamování chybí závěrečný `decoder.decode()` (flush) — teoretická ztráta posledního vícebajtového znaku rozděleného mezi chunky (řádky 110-125).
- „Nová konverzace" během streamování nezruší běžící fetch (chybí `AbortController`) — odpověď se dál stahuje naprázdno a `isLoading` blokuje vstup.
- Feedback ukládá poslední uživatelský dotaz v konverzaci, ne dotaz patřící hodnocené zprávě (řádky 160-163) — při hodnocení starší odpovědi se do DB zapíše nesouvisející `query`.

### 13. `.catch(() => {})` na supabase builderech je no-op

**Kde:** `src/app/api/documents/route.ts:69-71`, `src/app/api/documents/[id]/route.ts:22-25`

supabase-js chyby nevyhazuje, vrací je v poli `error` — `.catch()` tedy nic nechytá a skutečné chyby (např. selhání smazání souboru ze Storage → osiřelé soubory) se tiše ignorují. `createBucket` se navíc volá při každém uploadu, místo aby existence bucketu byla jednorázová (migrace/setup).

### 14. Duplicitní filename není kontrolován

**Kde:** `POST /api/documents` (`src/app/api/documents/route.ts`)

Stejný soubor lze nahrát opakovaně — vzniknou duplicitní dokumenty i chunky a retrieval pak vrací tentýž obsah vícekrát (vytlačuje jiné relevantní chunky z top-k). Stačí kontrola existujícího `filename` s odmítnutím nebo náhradou.

### 15. Tiché chybějící API klíče

**Kde:** `src/lib/config.ts:12-13`

`ANTHROPIC_API_KEY` a `VOYAGE_API_KEY` mají fallback `""`, takže chybějící klíč se projeví až nejasnou runtime chybou při prvním dotazu/indexaci. Vhodnější je ověřit je přes `required()` jako ostatní povinné proměnné (případně s jasnou chybou při prvním použití, pokud má app běžet i bez nich).
