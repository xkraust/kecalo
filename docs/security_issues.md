# Bezpečnostní kontrola — nálezy (kecalo)

Datum revize: 5. 7. 2026
Rozsah: celý zdrojový kód (`src/`), API routy, autentizace, RAG pipeline, klientské renderování, DB migrace (RLS).
Metoda: statická kontrola kódu, ne penetrační test.

Nezávislá kontrolní revize 5. 7. 2026: všech 8 původních nálezů potvrzeno (lokace i závažnosti sedí).
Doplněny nálezy SEC-9 a SEC-10, rozšíření SEC-1 (reset limiteru přes `hits.clear()`) a poznámky
k SEC-3 (validace vstupu `retrieval-test`) a SEC-6 (sanitizace přípony v cestě Storage).

Tento dokument je podkladem pro implementační plán oprav. Každý nález má stabilní ID
(`SEC-x`), lokaci, popis, dopad, konkrétní kroky nápravy a akceptační kritéria, aby
z něj šlo přímo vytvořit úkoly. Doporučené pořadí implementace viz sekce
[Návrh pořadí implementace](#návrh-pořadí-implementace).

## Souhrn

| ID | Závažnost | Název | Dotčené soubory |
|---|---|---|---|
| SEC-1 | 🟠 Vážné | Rate-limiting staví na spoofovatelné hlavičce `X-Forwarded-For` | `src/lib/rate-limit.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/chat/route.ts`, `src/app/api/leads/route.ts`, `src/app/api/feedback/route.ts` |
| SEC-2 | 🟠 Vážné | Admin autorizace stojí výhradně na proxy vrstvě (chybí druhá obranná linie) | `src/proxy.ts`, `src/app/api/documents/**`, `src/app/api/leads/[id]/route.ts`, `src/app/api/settings/route.ts`, `src/app/api/retrieval-test/route.ts` |
| SEC-3 | 🟡 Nezávažné | Únik DB chybových hlášek na veřejné routě | `src/app/api/feedback/route.ts` (+ admin routy) |
| SEC-4 | 🟡 Nezávažné | Logout neinvaliduje token na serveru | `src/lib/auth.ts`, `src/app/api/auth/logout/route.ts` |
| SEC-5 | 🟡 Nezávažné | Neomezený růst mapy `failedAttempts` u loginu | `src/app/api/auth/login/route.ts` |
| SEC-6 | 🟡 Nezávažné | `application/octet-stream` obchází kontrolu přípony u uploadu | `src/app/api/documents/route.ts` |
| SEC-7 | 🟡 Nezávažné | Klient posílá plnou historii vč. `assistant` zpráv (prompt injection) | `src/app/api/chat/route.ts`, `src/lib/rag/prompts.ts` |
| SEC-8 | 🟡 Nezávažné | CSRF bez explicitního tokenu (zmírněno `SameSite=Lax`) | `src/lib/auth.ts`, admin routy |
| SEC-9 | 🟡 Nezávažné | Prompt injection do shrnutí poptávky zobrazovaného v adminu | `src/app/api/leads/route.ts`, `src/app/admin/(authenticated)/leads/client.tsx` |
| SEC-10 | 🟡 Nezávažné | Chybějící bezpečnostní HTTP hlavičky (CSP, X-Frame-Options, HSTS) | `next.config.ts` |

**Kritické nálezy:** žádné. Nenalezena neautentizovaná cesta k převzetí systému, únik service-role
klíče, SQL injection ani XSS. Session je HMAC-podepsaná klíčem odděleným od hesla, porovnání údajů
je constant-time, RLS je zapnutá na všech tabulkách bez anon policy, service-role klíč je jen na
serveru, `react-markdown` běží bez `rehype-raw`.

---

## SEC-1 — Rate-limiting staví na spoofovatelné hlavičce `X-Forwarded-For`

**Závažnost:** 🟠 Vážné
**Lokace:** `src/lib/rate-limit.ts:39-43` (`clientIp`), použito v `src/app/api/auth/login/route.ts`,
`src/app/api/chat/route.ts`, `src/app/api/leads/route.ts`, `src/app/api/feedback/route.ts`.

### Popis
`clientIp()` bere **nejlevější** hodnotu z hlavičky `X-Forwarded-For`, kterou plně ovládá klient.
Rotací hlavičky (jiná hodnota na každý požadavek) se rozdělí požadavky do různých klíčů rate-limiteru
a limit se fakticky ruší.

Souvislost s pojistkou `MAX_KEYS` (`src/lib/rate-limit.ts:27`): při přetečení mapy (5000 klíčů) se
volá `hits.clear()`, tedy **smažou se počítadla všech klientů najednou** — včetně útočníkova. Kdo
spoofuje XFF, může limiter úmyslně přeplnit a tím si resetovat vlastní limit; zároveň se resetují
limity všem legitimním klientům.

### Dopad
- **Brute-force na login** (`login/route.ts`): limit 5 pokusů / 15 min je jediná ochrana proti hádání
  hesla; spoofingem IP lze zkoušet neomezeně.
- **Cost amplification / finanční DoS**: `/api/chat` volá na každý požadavek Voyage embedding + Claude
  Sonnet, `/api/leads` volá Claude Haiku. Obejitím limitu (20/min, resp. 5/min) lze generovat
  neomezené náklady na LLM a embeddingy.
- **Spam** poptávek a feedbacku do DB.

### Náprava
1. V `clientIp()` přestat důvěřovat klientem řízené levé hodnotě `X-Forwarded-For`. Na Vercelu použít
   platformou dosazenou identitu klienta — přednostně `x-real-ip`, případně pravou (poslední) důvěryhodnou
   hodnotu XFF, kterou dosazuje platforma.
2. Zvážit náhradu per-instance in-memory limiteru sdíleným úložištěm (Upstash/Vercel KV) — současný
   limiter se navíc na serverless nuluje se studeným startem a počítá každá instance zvlášť.
3. U loginu doplnit ochranu nezávislou na IP (např. globální strop pokusů, exponenciální zpoždění nebo
   CAPTCHA po N selháních).
4. V `createRateLimiter` nahradit `hits.clear()` při přetečení `MAX_KEYS` vystěhováním nejstarších
   klíčů (LRU / klíče s nejstaršími timestampy) — přeplnění mapy nesmí resetovat počítadla ostatních.

### Akceptační kritéria
- Změna `X-Forwarded-For` mezi požadavky neresetuje počítadlo (ověřit skriptem: N+1 pokusů o login
  s různou hlavičkou vrátí 429 po dosažení limitu).
- Chování na Vercelu ověřeno s reálným klientem (limit se uplatní podle skutečné IP).
- Naplnění mapy limiteru mnoha klíči neresetuje počítadlo existujícího klíče (ověřit unit testem
  s `MAX_KEYS + 1` různými klíči).

---

## SEC-2 — Admin autorizace stojí výhradně na proxy vrstvě

**Závažnost:** 🟠 Vážné
**Lokace:** `src/proxy.ts` (jediné místo kontroly); handlery bez vlastní kontroly session:
`src/app/api/documents/route.ts`, `src/app/api/documents/[id]/route.ts`,
`src/app/api/documents/[id]/reprocess/route.ts`, `src/app/api/leads/[id]/route.ts`,
`src/app/api/settings/route.ts`, `src/app/api/retrieval-test/route.ts`.

### Popis
Admin API routy nemají žádné ověření session ve vlastním handleru — autorizace je pouze v proxy vrstvě.
Matcher v `proxy.ts` aktuálně pokrývá všechny admin cesty správně, jde tedy o architektonické riziko
(chybějící druhá obranná linie), ne o aktuálně otevřenou díru.

### Dopad
Pokud proxy selže nebo se obejde (chybný matcher po budoucí úpravě, regrese/CVE v Next.js — historicky
např. CVE-2025-29927, obcházení middleware autorizace hlavičkou `x-middleware-subrequest`), vystaví se
okamžitě: mazání dokumentů, změna runtime parametrů, čtení poptávek s osobními údaji — vše přes
service-role klíč, který obchází RLS. Oficiální doporučení Next.js je nepoužívat middleware/proxy jako
jediné místo autorizace.

### Náprava
1. Vytvořit sdílený helper (např. `src/lib/require-admin.ts`), který přečte session cookie a zavolá
   `verifySession()` (funkce už existuje v `src/lib/auth.ts`); při neplatnosti vrátí 401.
2. Zavolat ho na začátku každého admin handleru (GET/POST/DELETE/PATCH), včetně `PATCH /api/leads/[id]`
   — pozor, `POST /api/leads` musí zůstat veřejné.
3. Ponechat proxy jako první vrstvu (redirect stránek na login + rychlé 401 pro API).

### Akceptační kritéria
- Přímé volání admin API bez platné cookie vrátí 401 i při dočasně vypnuté/obejité proxy (ověřit např.
  dočasným rozšířením matcheru tak, aby routa nebyla chráněna proxy, a potvrdit, že handler sám vrátí 401).
- `POST /api/leads` a ostatní veřejné routy fungují beze změny.

---

## SEC-3 — Únik DB chybových hlášek na veřejné routě

**Závažnost:** 🟡 Nezávažné
**Lokace:** `src/app/api/feedback/route.ts:52` (veřejné); dále admin routy `documents/route.ts`,
`settings/route.ts`, `leads/[id]/route.ts`, `retrieval-test/route.ts`.

### Popis
Routy vracejí klientovi `error.message` přímo z Postgresu/Supabase. Na veřejné `/api/feedback` to znamená
drobný únik detailů schématu neautentizovanému uživateli. U admin rout je to za autentizací (nižší riziko).

**Související poznámka (validace vstupu):** `retrieval-test/route.ts:10` kontroluje jen truthy
`body.query` — nevaliduje typ (string) ani délku a hodnota jde rovnou do Voyage embeddingu. Za
autentizací, takže jen drobnost, ale je to nekonzistentní s validací ostatních rout (`parseMessages`,
`parseLeadInput`); opravit společně.

### Náprava
1. Vracet klientovi generickou hlášku, detail logovat serverově (`console.error`) — vzor už používá
   `POST /api/leads` (`route.ts:285`).
2. Sjednotit napříč routami.
3. V `retrieval-test` validovat `query` jako string s rozumným limitem délky (např. 4 000 znaků jako
   chat), jinak 400.

### Akceptační kritéria
- Odpovědi 5xx neobsahují surové DB hlášky; detail je jen v serverovém logu.
- `POST /api/retrieval-test` s ne-stringovým nebo příliš dlouhým `query` vrací 400.

---

## SEC-4 — Logout neinvaliduje token na serveru

**Závažnost:** 🟡 Nezávažné (dokumentované omezení prototypu)
**Lokace:** `src/lib/auth.ts:5-7`, `src/app/api/auth/logout/route.ts`.

### Popis
Logout jen maže cookie; podepsaný token platí až do expirace (8 h). Odcizená/uniklá cookie je použitelná
i po odhlášení.

### Náprava (pro produkci)
1. Zavést server-side session store nebo revokační seznam (např. tabulka aktivních session / jti v DB,
   kontrola při `verifySession`).
2. Alternativně zkrátit TTL a přidat rotaci tokenu.

### Akceptační kritéria
- Po logoutu je dříve platná cookie odmítnuta (401) i před vypršením 8 h.

---

## SEC-5 — Neomezený růst mapy `failedAttempts` u loginu

**Závažnost:** 🟡 Nezávažné
**Lokace:** `src/app/api/auth/login/route.ts:16`.

### Popis
Na rozdíl od `src/lib/rate-limit.ts` (má strop `MAX_KEYS`) nemá mapa `failedAttempts` žádný limit velikosti.
Spoofingem mnoha různých IP (viz SEC-1) lze tlačit paměť instance. Dopad malý (serverless instance recyklují),
ale je to nekonzistentní s hlavním limiterem.

### Náprava
1. Sjednotit login na sdílený `createRateLimiter` z `rate-limit.ts` (má ochranu proti přetečení mapy), nebo
   doplnit stejný strop/čištění i do mapy v `login/route.ts`.

### Akceptační kritéria
- Počet klíčů v mapě je shora omezený; při překročení se mapa čistí (jako v `rate-limit.ts`).

---

## SEC-6 — `application/octet-stream` obchází kontrolu přípony u uploadu

**Závažnost:** 🟡 Nezávažné
**Lokace:** `src/app/api/documents/route.ts:8-21` (`ALLOWED_TYPES`, `isAllowedFile`).

### Popis
Soubor s MIME `application/octet-stream` projde `isAllowedFile` na první podmínce (`ALLOWED_TYPES.has(file.type)`)
bez ohledu na příponu. Riziko je nízké (obsah zpracovává unpdf / textový parser, cesta ve Storage je serverová
`{uuid}/file.{ext}`, bez path traversalu), ale kontrola přípony se tím fakticky obchází.

**Související poznámka (sanitizace přípony):** `ext` na `documents/route.ts:129` se bere jako
`file.name.split(".").pop()` z klientského názvu a může obsahovat `/` (např. název `evil.pdf/x` →
cesta `{uuid}/file.pdf/x`, ručně sestaveným requestem). Traversal přes `..` možný není (tečky řetězec
rozdělí) a routa je admin-only, jde tedy jen o hardening — whitelist přípon z nápravy níže to vyřeší
zároveň.

### Náprava
1. U `application/octet-stream` vždy vyžadovat kontrolu přípony (přesunout octet-stream mimo `ALLOWED_TYPES`
   a spoléhat jen na whitelist přípon `pdf/txt/md`).
2. Tentýž whitelist (`pdf|txt|md`) použít i pro `ext` při sestavování cesty ve Storage — do cesty se
   nikdy nesmí dostat hodnota mimo whitelist.
3. Volitelně ověřit magické bajty PDF (`%PDF`) u souborů deklarovaných jako PDF.

### Akceptační kritéria
- Soubor s neplatnou příponou a MIME `application/octet-stream` je odmítnut (400).
- Cesta ve Storage má vždy tvar `{uuid}/file.(pdf|txt|md)` — přípona mimo whitelist se do cesty nedostane.
- Platné PDF/TXT/MD dál procházejí.

---

## SEC-7 — Klient posílá plnou historii vč. `assistant` zpráv (prompt injection)

**Závažnost:** 🟡 Nezávažné
**Lokace:** `src/app/api/chat/route.ts` (`parseMessages` přijímá role `assistant`), `src/lib/rag/prompts.ts`.

### Popis
Historie konverzace je klientská; `/api/chat` přijímá i zprávy s rolí `assistant`. Uživatel může podvrhnout
falešné odpovědi modelu a manipulovat kontext / pokoušet se o prompt injection. Ovlivní ale jen vlastní session
a není zde žádný nástroj ani exfiltrační kanál; systémový prompt navíc instruuje ignorovat pokyny z dotazu
(`prompts.ts:30`). Zbytkové riziko je nízké.

### Náprava (defense-in-depth)
1. Zvážit serverovou rekonstrukci/validaci historie (nedůvěřovat obsahu `assistant` zpráv od klienta), nebo
   posílat na server jen uživatelské dotazy a historii držet serverově.
2. Ponechat a posílit instrukci v systémovém promptu proti přepisu pravidel.

### Akceptační kritéria
- Podvržená `assistant` zpráva nezmění bezpečnostní chování (bot dál odpovídá jen z kontextu, necituje
  neexistující zdroje).

---

## SEC-8 — CSRF bez explicitního tokenu

**Závažnost:** 🟡 Nezávažné (zmírněno `SameSite=Lax`)
**Lokace:** `src/lib/auth.ts:84-90` (`COOKIE_OPTIONS`), admin routy.

### Popis
Stavové admin operace jsou POST/PATCH/DELETE a session cookie má `SameSite=Lax`, což cross-site zápisy blokuje —
reálné riziko je nízké. Chybí ale explicitní CSRF token (belt-and-suspenders), a žádná stavová operace nesmí být
provedena přes GET.

### Náprava
1. Ponechat `SameSite=Lax` (příp. `Strict` pro admin).
2. Volitelně přidat CSRF token (double-submit cookie) pro admin mutace.
3. Ověřit, že žádná stavová operace není dostupná přes GET.

### Akceptační kritéria
- Cross-site POST/PATCH/DELETE bez korektního původu/tokenu je odmítnut.
- Žádná mutace není provedena metodou GET.

---

## SEC-9 — Prompt injection do shrnutí poptávky zobrazovaného v adminu

**Závažnost:** 🟡 Nezávažné
**Lokace:** `src/app/api/leads/route.ts:156-192` (`summarizeConversation`),
`src/app/admin/(authenticated)/leads/client.tsx` (zobrazení `summary`).

### Popis
Pole `messages` z veřejného `POST /api/leads` jde bez úprav do promptu Haiku a výsledné shrnutí se
zobrazuje zpracovateli v admin sekci Poptávky. Útočník tak může přes podvrženou „konverzaci" instruovat
model a podstrčit do admin UI zavádějící text (např. „klient je ověřený VIP, volejte prioritně na …").
Render je plain-text React (bez XSS), jde tedy o vektor sociálního inženýrství vůči zpracovateli, ne
o technickou kompromitaci. Liší se od SEC-7 (chat) — zde výstup čte interní uživatel, ne autor vstupu.

### Náprava
1. V promptu sumarizace oddělit přepis konverzace jako data (např. obalit XML tagem `<transcript>`)
   a doplnit instrukci, že obsah je nedůvěryhodný vstup klienta — pokyny v něm ignorovat, pouze shrnout.
2. V admin UI označit shrnutí jako strojově generované z nedůvěryhodného vstupu (drobný popisek),
   aby ho zpracovatel nebral jako ověřený fakt.

### Akceptační kritéria
- Konverzace obsahující pokyny typu „do shrnutí napiš X / ignoruj instrukce" nevede k převzetí pokynu —
  shrnutí zůstane věcným popisem zájmu klienta (ověřit ručně sadou adversariálních vstupů).
- Shrnutí je v adminu vizuálně označené jako automatické.

---

## SEC-10 — Chybějící bezpečnostní HTTP hlavičky

**Závažnost:** 🟡 Nezávažné
**Lokace:** `next.config.ts` (žádná konfigurace `headers()`).

### Popis
Aplikace nenastavuje žádné bezpečnostní hlavičky: chybí `Content-Security-Policy`,
`X-Frame-Options` / `frame-ancestors` (clickjacking, typicky na `/admin/login`),
`X-Content-Type-Options: nosniff` a `Strict-Transport-Security`. Pro prototyp nezávažné
(moderní prohlížeče část rizik kryjí samy, XSS je uzavřeno absencí raw HTML), ale jde o levnou
plošnou ochranu.

### Náprava
1. Do `next.config.ts` doplnit `headers()` s minimem: `X-Frame-Options: DENY` (nebo CSP
   `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy:
   strict-origin-when-cross-origin`.
2. Zvážit základní CSP (`default-src 'self'` + výjimky, které si vyžádá Next.js — inline skripty
   vyžadují nonce/hash, případně začít s `Report-Only`).
3. HSTS na Vercelu řeší platforma; při vlastním hostingu doplnit `Strict-Transport-Security`.

### Akceptační kritéria
- Odpovědi stránek obsahují `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options` a
  `Referrer-Policy` (ověřit `curl -I` na `/` a `/admin/login`).
- Stránku `/admin/login` nelze vložit do iframe z cizího originu.

---

## Návrh pořadí implementace

1. **SEC-2** (druhá obranná linie autorizace) — nízké riziko regrese, vysoká ochranná hodnota; sdílený
   helper lze nasadit rychle.
2. **SEC-1** (identita klienta pro rate-limit + tvrdší ochrana loginu, vč. náhrady `hits.clear()`) —
   největší reálný dopad (brute-force, náklady); vyžaduje ověření chování na Vercelu.
3. **SEC-3, SEC-5, SEC-6, SEC-10** — drobné, rychlé opravy (generické chyby + validace `retrieval-test`,
   strop mapy, kontrola přípony + sanitizace cesty, bezpečnostní hlavičky).
4. **SEC-9** — úprava promptu sumarizace + popisek v UI; malá změna, ale chce ruční ověření na
   adversariálních vstupech.
5. **SEC-4, SEC-7, SEC-8** — vyžadují návrhové rozhodnutí (session store, serverová historie, CSRF token);
   vhodné jako samostatná fáze, případně odložit pro produkci.

## Pozitivní zjištění (zachovat)

- HMAC podpis session klíčem odděleným od hesla, constant-time `verifySession` / `safeEqual`, nonce v tokenu
  (`src/lib/auth.ts`).
- Escapování hodnot atributů do promptu (`src/lib/rag/prompts.ts:37`).
- Filtr `status='ready'` a práh podobnosti v SQL RPC (`supabase/migrations/002_match_chunks.sql`).
- RLS zapnutá na všech tabulkách bez anon policy, vč. `leads` s osobními údaji
  (`supabase/migrations/004_enable_rls.sql`, `010_leads.sql`).
- `react-markdown` bez `rehype-raw` → žádné raw HTML (XSS uzavřeno).
- Validace a limity vstupů, `maxOutputTokens`, žádný verzovaný `.env`.
