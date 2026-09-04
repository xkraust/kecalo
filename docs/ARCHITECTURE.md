# Kecalo — technický popis architektury

Dokument popisuje **aktuální stav** systému pro vývojáře, který má projekt pochopit a rozvíjet. Historie vzniku (fáze, měření, rozhodnutí) je v [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), zadání v [PRD](PRD_pojistovaci_RAG_chatbot.md).

## 1. Přehled systému

Kecalo je RAG (Retrieval-Augmented Generation) chatbot pro pojišťovnu. Znalostní bázi tvoří PDF dokumenty pojistných podmínek nahrané adminem; návštěvník klade otázky česky a bot odpovídá výhradně z indexovaných dokumentů, vždy s citací zdroje. Systém má dvě oddělené pipeline:

```
INDEXACE (při uploadu / reindexaci)
  admin upload ──► POST /api/documents ──► Storage
                        │
                        ▼  processDocument (src/lib/rag/pipeline.ts)
  extract ──► clean ──► chunk ──► embed (Voyage) ──► INSERT chunks (pgvector)

DOTAZ (při každé zprávě v chatu)
  návštěvník ──► POST /api/chat (src/app/api/chat/route.ts)
                        │
       embed dotazu ──► match_chunks (SQL, práh podobnosti)
                        │
          0 chunků ──► statický fallback (LLM se nevolá)
          jinak    ──► system prompt + <context> ──► Claude ──► stream + X-Sources
```

Vedle chatu systém sbírá **poptávky** (leady): u produktových dotazů model přidá token `[[NABIDKA]]`, klient místo něj vykreslí kartu kontaktu a odeslání uloží lead se shrnutím konverzace (generuje Mistral). Admin sekce spravuje dokumenty, poptávky, runtime parametry a prompty.

## 2. Technologický stack

| Technologie | Role |
|---|---|
| Next.js 16 (App Router) + React 19 + TypeScript | framework, `src/` struktura, API routes |
| Tailwind CSS v4 + shadcn/ui | UI; konfigurace přes `@theme` v `globals.css`, bez `tailwind.config.ts` |
| Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/mistral`) | orchestrace LLM: `streamText`, `useChat`, telemetrie |
| Claude API (`claude-sonnet-4-6`) | generování odpovědí chatu |
| Mistral (`mistral-small-latest`) | shrnutí konverzace u poptávek (levnější kompresní úloha; prototypový experiment, viz [plans/mistral_summary_experiment_plan.md](plans/mistral_summary_experiment_plan.md)) |
| Voyage AI (`voyage-3.5`, 1024 dim) | embeddingy dotazů i chunků |
| Supabase | Postgres + pgvector (vektorové vyhledávání), Storage (originály souborů) |
| `unpdf` | extrakce textu z PDF po stránkách |
| OpenTelemetry + Langfuse | tracing RAG pipeline (volitelné — bez klíčů app běží bez logování) |

Pozn. k verzím: `@ai-sdk/*` providery jsou pinované na majory kompatibilní s `ai@6` — novější major neprojde typecheckem.

## 3. RAG architektura

### 3.1 Indexační pipeline — `src/lib/rag/pipeline.ts`

`processDocument(documentId)` se spouští z `POST /api/documents` (po uploadu) a `POST /api/documents/[id]/reprocess` (reindexace bez re-uploadu). Postup:

1. Načte runtime parametry chunkování (`getSettings()`).
2. Stáhne originál ze Supabase Storage (`documents/{id}/file.{ext}`).
3. `extract.ts` — PDF → text po stránkách (`unpdf`); `.txt`/`.md` prostý text.
4. `clean.ts` — frekvenční odstranění opakovaných záhlaví/patiček (práh 60 % stránek, bez hardcoded vzorů) + slepení řádků rozdělených sazbou PDF. Mapování na strany zůstává.
5. `chunk.ts` — strukturní chunkování: parser hierarchie dokumentu (část → článek → odstavec) + greedy skladač celých sekcí do chunků cílové velikosti (default 3 500 znaků, strop 1,3×, bez překryvu), volitelná breadcrumb hlavička `[docTitle › část › článek]` embedovaná s textem. Nestrukturované dokumenty (< 30 % obsahu v sekcích) se dělí po odstavcích.
6. `embed.ts` — `embedBatch` přes Voyage AI.
7. Vloží nové chunky po dávkách 100 s novým `batch_id`, **pak** smaže staré (`batch_id != nový`, jeden atomický DELETE). Selhání před výměnou → úklid nového batche, původní data přežijí.
8. Nastaví `status = ready` a uloží otisk konfigurace do `documents.chunking_config` — UI podle něj detekuje zastaralé chunkování (`isChunkingStale` v [`src/lib/settings-meta.ts`](../src/lib/settings-meta.ts)).

Chyby se ukládají do `documents.error_message` a dokument končí ve stavu `error`; stavový diagram: `uploaded → processing → ready | error`.

### 3.2 Dotazovací pipeline — `src/app/api/chat/route.ts`

1. **Rate limit** 20 požadavků/min na IP (sdílený helper [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts)); překročení → 429.
2. **Validace** (`parseMessages`): role jen `user`/`assistant`, content string ≤ 4 000 znaků, max 50 zpráv; jinak 400.
3. **Retrieval** — `retrieve(query, topK, threshold, audiences)`: embedding dotazu (Voyage) → Postgres RPC `match_chunks` (migrace `002` + `007` + `016`). **Práh podobnosti i filtr štítků se uplatňují v SQL**, ne v JS; funkce vrací jen chunky z dokumentů ve stavu `ready`, které volající smí vidět. Štítky se odvozují serverově ze session ([`src/lib/audience-access.ts`](../src/lib/audience-access.ts)) — `NULL` = bez filtru, `'{}'` = jen veřejné dokumenty (anonymní návštěvník chatu). Viz §6.
4. **Fallback** — 0 chunků → statická `text/plain` odpověď `FALLBACK_MESSAGE` s prázdným `X-Sources`; Claude se nevolá.
5. **Generování** — `buildContextBlock` složí `<document>` bloky (zdroj, sekce, strana) do system promptu (runtime override `settings.systemPrompt ?? SYSTEM_PROMPT`); historie ořezaná na posledních 8 zpráv; `streamText` s `maxOutputTokens: 1500`, teplotou z nastavení a `abortSignal` (odpojení klienta zastaví generování).
6. **Zdroje** — metadata (filename ≤ 80 zn., section ≤ 100 zn., strana, zaokrouhlená similarity) v hlavičce `X-Sources` (URL-encoded JSON); nad 8 000 znaků se sekce vynechají (limit velikosti hlaviček).
7. **Token `[[NABIDKA]]`** — system prompt instruuje model přidat ho na konec odpovědi u produktových dotazů; klient token odstraní a vykreslí kartu poptávky (`LeadForm`).
8. **Telemetrická identita** — nepovinné `sessionId` v těle (`parseSessionId`, ≤ 64 zn.) se propíše na rodičovský span jako `langfuse.session.id`; span nese i `langfuse.trace.name` = `chat-rag`. Trace id se vrací hlavičkou `X-Trace-Id` (obě větve — stream i fallback) a klient si ho drží v `ChatMessage.traceId`. Telemetrie nesmí ovlivnit odpověď: nevalidní `sessionId` se tiše ignoruje.
9. **Otisk promptu** — `langfuse.trace.metadata.prompt_hash` (SHA-256 efektivního system promptu, prvních 12 zn.) a `prompt_source` (`default`/`override`) umožňují porovnávat skóre napříč verzemi promptu bez migrace do Prompt Managementu. Jen otisk, nikdy text promptu.

### 3.3 Moduly `src/lib/rag/`

| Modul | Odpovědnost |
|---|---|
| [`extract.ts`](../src/lib/rag/extract.ts) | PDF/TXT/MD → text po stránkách |
| [`clean.ts`](../src/lib/rag/clean.ts) | čištění mezi extrakcí a chunkováním; exportuje strukturní vzory sdílené s parserem |
| [`chunk.ts`](../src/lib/rag/chunk.ts) | strukturní chunkování (parser hierarchie + skladač sekcí) |
| [`embed.ts`](../src/lib/rag/embed.ts) | `embedQuery` (dotaz) a `embedBatch` (indexace) přes Voyage AI |
| [`retrieve.ts`](../src/lib/rag/retrieve.ts) | embedding dotazu → RPC `match_chunks` → chunky se skóre |
| [`prompts.ts`](../src/lib/rag/prompts.ts) | výchozí `SYSTEM_PROMPT`, `LEAD_SUMMARY_PROMPT`, `FALLBACK_MESSAGE`, `buildContextBlock` |
| [`pipeline.ts`](../src/lib/rag/pipeline.ts) | indexace dokumentu (`processDocument`) |

## 4. Datový model

Schéma se mění **výhradně migracemi** v `supabase/migrations/` (`001`–`019`), nikdy ručně v SQL editoru. Aplikace přistupuje service-role klíčem (obchází RLS); RLS je na tabulkách zapnuté bez policy pro anon — přímý anonymní přístup je tak zablokovaný.

| Tabulka | Účel |
|---|---|
| `documents` | metadata dokumentu: `filename`, `status` (`uploaded/processing/ready/error`), `chunk_count`, `error_message`, `chunking_config` (otisk parametrů poslední indexace), `visibility` (`public`/`restricted`) |
| `chunks` | `content`, `embedding vector(1024)` s HNSW indexem, `page`, `section_path` (cesta v hierarchii), `chunk_index`, `batch_id` (identifikátor indexačního běhu), FK na `documents` s CASCADE |
| `app_settings` | jednořádková konfigurace (id = 1): RAG parametry, přepínače telemetrie, parametry chunkování, prompt overridy (`system_prompt`/`lead_summary_prompt`, NULL = výchozí z kódu), `default_document_visibility`, retence (`retention_enabled` — default **false**, `retention_leads_months` 24, `retention_feedback_months` 6) |
| `feedback` | palec nahoru/dolů; UNIQUE (session_id, message_index) — jeden hlas na zprávu |
| `leads` | poptávky: kontakt (CHECK aspoň email nebo telefon), `summary` (Mistral shrnutí konverzace), `status` (`new/updated/in_progress/closed`), `type` (`produkt`/`hodnoceni`), `consent`; deduplikace podle kontaktu v rámci téhož typu; nemažou se |
| `users` | identity a **aplikační role** (migrace `014`, `015`, `018`): `email citext UNIQUE` (zároveň přihlašovací údaj), `first_name`/`last_name`, `app_role` (`admin`/`editor`/`viewer`), `auth_provider` (`local`/`oidc`), `password_hash` (NULL u SSO), `(external_issuer, external_subject)` UNIQUE, `is_active`, `must_change_password`, `sessions_invalid_before` (per-user revokace). Uživatelé se nemažou, jen deaktivují |
| `audiences` | číselník **štítků dokumentů** (migrace `016`): `code`, `label` — komu obsah patří |
| `job_roles` | číselník **pracovních rolí** (migrace `016`, `017`): `code`, `label`, `external_group` (název skupiny v IdP, partial UNIQUE — jedna skupina mapuje nejvýš na jednu roli) |
| `document_audiences`, `job_role_audiences`, `user_job_roles` | vazební tabulky: dokument→štítek, pracovní role→štítky, uživatel→pracovní role |
| `user_effective_audiences` | view: sjednocení štítků, které uživatel drží přes své pracovní role — jediný zdroj pro filtr v `match_chunks` |
| `auth_state` | jednořádková: `sessions_invalid_before` — globální revokace všech session; od zavedení `users` jen ruční kill-switch pro incident |
| `privacy_actions` | auditní stopa výmazů (migrace `019`, čl. 5 odst. 2): `kind` (`retention`/`erasure`), `subject_hash` (HMAC otisk kontaktu, nikdy kontakt sám), počty smazaných řádků, `performed_by` (NULL = cron) |

CHECK constrainty v migracích zrcadlí rozsahy definované v [`src/lib/settings-meta.ts`](../src/lib/settings-meta.ts) (jediný zdroj pravdy pro validaci; DB je druhá obranná linie).

## 5. API

**Veřejné routy** (bez autentizace, s rate limity na IP):

| Routa | Účel | Limit |
|---|---|---|
| `POST /api/chat` | RAG pipeline → streamovaná odpověď + `X-Sources` + `X-Trace-Id` | 20/min |
| `POST /api/feedback` | uložení hlasu palec nahoru/dolů (+ skóre `user-thumbs` v Langfuse při dodaném `traceId`) | 10/min |
| `POST /api/leads` | uložení poptávky + Mistral shrnutí + deduplikace | 5/min |
| `POST /api/auth/login`, `/api/auth/logout` | přihlášení/odhlášení uživatele | login 5/15 min na IP i na e-mail |
| `GET /api/auth/oidc/start`, `/api/auth/oidc/callback` | SSO tok přes firemní IdP (jen když je nastavený `OIDC_ISSUER`) | — |

**Chráněné routy** (session cookie; bez ní 401, s nedostatečnou rolí 403). Minimální aplikační role u každé z nich:

| Routa | Role |
|---|---|
| `GET /api/documents`, `POST /api/retrieval-test`, `GET /api/settings` | `viewer` |
| `POST /api/documents`, `DELETE /api/documents/[id]`, `POST /api/documents/[id]/reprocess`, `PATCH /api/leads/[id]` | `editor` |
| `PATCH /api/documents/[id]` (viditelnost, štítky) | `editor`; nastavit `public` a cizí štítky smí jen `admin` |
| `POST /api/settings` (vč. promptů) | `admin` |
| `POST /api/privacy/settings` (retenční lhůty), `POST /api/privacy/retention` (ruční úklid), `POST /api/privacy/subject` (vyhledání/výmaz dat subjektu) | `admin` |
| `GET/POST /api/users`, `PATCH /api/users/[id]` | `admin` |
| `GET/POST /api/job-roles`, `PATCH/DELETE /api/job-roles/[code]` | `admin` |
| `GET/POST /api/audiences`, `PATCH/DELETE /api/audiences/[code]` | `admin` |

`POST /api/auth/change-password` vyžaduje jen přihlášení — projde i účtu s `must_change_password`, který jinde dostává 403.

Vodicí pravidlo dělby: **editor spravuje obsah a agendu, ne systém.** Prompty, RAG parametry a správa identit proto zůstávají adminovi.

### 5.1 Retenční cron

`GET /api/cron/retention` stojí **mimo** session i proxy matcher — cron žádnou cookie nemá. Autorizuje se výhradně hlavičkou `Authorization: Bearer $CRON_SECRET` (porovnání `timingSafeEqual` nad SHA-256 otisky, aby neunikla délka secretu). Chybějící `CRON_SECRET` routu **vypíná** (503); otevřená mazací routa nad service-role klientem by byla horší než nefungující úklid. Rozvrh `0 3 * * *` je ve `vercel.json`.

## 6. Bezpečnost

Přístup stojí na **třívrstvém modelu oprávnění**: aplikační role (co smíš dělat), pracovní role sdružující štítky (kdo jsi v organizaci) a štítky dokumentů (komu obsah patří) — viz [plán rolí](plans/roles_and_document_access_plan.md). Session je vlastní podepsaná cookie, ne JWT — vědomé rozhodnutí; přihlásit se jde heslem i přes firemní IdP. Detailní nálezy a opravy: [reviews/security_issues.md](reviews/security_issues.md) + [reviews/security_correction_plan.md](reviews/security_correction_plan.md).

- **Session:** cookie v2 `v2.ts.uid.nonce.sig` podepsaná HMAC-SHA256 klíčem `SESSION_SECRET` (nikdy heslem), platnost 8 h, ověření constant-time (`crypto.subtle.verify`). Nese **id uživatele**, nikdy roli — ta se čte z DB při každém požadavku, aby odebrání oprávnění platilo okamžitě. Starý tříčlenný formát v1 je záměrně odmítnut. Viz [`src/lib/auth.ts`](../src/lib/auth.ts).
- **Dvě obranné linie:** proxy vrstva [`src/proxy.ts`](../src/proxy.ts) (edge — podpis + expirace) chrání `/admin` stránky i admin API; každý admin handler navíc volá `requireAppRole(min)` ([`src/lib/require-role.ts`](../src/lib/require-role.ts)) — 401/403 i při obejití proxy (SEC-2). Roli a revokaci ověřuje až tato Node vrstva, protože edge runtime nemá přístup k DB.
- **Identity a aplikační role:** uživatelé v tabulce `users` (migrace `014`, `018`) — jméno, příjmení a e-mail, který zároveň slouží jako přihlašovací údaj; role `admin`/`editor`/`viewer`, hesla scryptem ([`src/lib/password.ts`](../src/lib/password.ts)), session cookie v2 nese `uid` a role se čte z DB per request ([`src/lib/session-user.ts`](../src/lib/session-user.ts)). Viz [plán rolí](plans/roles_and_document_access_plan.md).
- **Viditelnost dokumentů (etapa C):** `documents.visibility` (`public`/`restricted`) + štítky v `document_audiences`. Uživatel štítky získává výhradně přes pracovní role (`user_job_roles` → `job_role_audiences`, view `user_effective_audiences`). Filtr je **v SQL** (`match_chunks` s `caller_audiences`), ne v JS — chunk, který uživatel nesmí vidět, se nedostane ani do paměti procesu. `NULL` = bez filtru (admin), `'{}'` = jen veřejné (anonym). Štítky se odvozují serverově ze session ([`src/lib/audience-access.ts`](../src/lib/audience-access.ts)), nikdy z těla požadavku.
- **SSO / OIDC (etapa D):** volitelné napojení na firemní IdP (`openid-client` v6). `GET /api/auth/oidc/start` → IdP → `GET /api/auth/oidc/callback`; state, nonce i PKCE verifier se drží v podepsané httpOnly cookie ([`src/lib/auth/oidc-flow.ts`](../src/lib/auth/oidc-flow.ts)), protože na serverless běží obě routy klidně na jiné instanci. Účet vzniká JIT ([`src/lib/auth/provision.ts`](../src/lib/auth/provision.ts)), páruje se přes `(iss, sub)` a skupiny se mapují na pracovní role přes `job_roles.external_group`. Od vydání cookie je zbytek aplikace na způsobu přihlášení nezávislý.
- **Iniciální heslo:** nového uživatele zakládá admin v `/admin/users`, heslo generuje aplikace a zobrazí ho jednou. Účet má `must_change_password` (migrace `015`) a do změny hesla dostane 403 na všech routách kromě `/api/auth/change-password`. Poslední aktivní admin nejde degradovat ani deaktivovat; vlastní roli si admin měnit nesmí.
- **Revokace session (SEC-4):** dvouúrovňová. Primární je **per-user** `users.sessions_invalid_before` — posouvá ji logout, reset hesla, deaktivace účtu i změna pracovních rolí ze SSO; odhlásí jen dotčeného uživatele ([`src/lib/session-revocation.ts`](../src/lib/session-revocation.ts)). Globální `auth_state` zůstala jako **ruční kill-switch pro incident**; volat ji z logoutu by znamenalo, že kterýkoli uživatel odhlásí celou organizaci. Kontroluje se v Node runtimu (`getSessionUser()` / `requireAppRole()` + admin layout); fail-open při chybějící tabulce.
- **Login:** hesla se ověřují scryptem v konstantním čase; pro neznámý, neaktivní i SSO účet se volá `burnPasswordTime()`, aby latence neprozradila existenci účtu. Rate limit 5 pokusů / 15 min **na IP** a 5 / 15 min **na e-mail** (cílený útok na jeden účet nezablokuje ostatní), plus globální strop 300 selhání / 15 min přes všechny IP jako pojistka poslední instance (SEC-1 — nezávislé na spoofovatelné IP). Globální strop byl původně 30; s jedinou identitou dával smysl, s více účty by se stal DoS vektorem — útočník by jím uzamkl přihlášení všem.
- **Identita klienta:** `x-real-ip` (na Vercelu dosazuje platforma), fallback pravá hodnota `x-forwarded-for`; levá (spoofovatelná) se nepoužívá.
- **Prompt injection do admin UI (SEC-9):** přepis konverzace jde do promptu shrnutí izolovaný v bloku `<transcript>` jako nedůvěryhodná data; wrapping a sanitizace jsou v kódu, nezávisle na editovatelném promptu.
- **Vědomý dluh:** SEC-7 (serverová historie chatu) a SEC-8 (CSRF token) odloženy jako produkční dluh.

### 6.1 Osobní údaje a retence

Zpracování osobních údajů řeší [plán GDPR](plans/gdpr_plan.md) (etapy A–C hotové, D–G zbývají). Kde osobní údaje vznikají: `leads` (jméno, kontakt, poznámka, LLM shrnutí konverzace), `feedback` (**doslovný text hodnoceného dotazu**) a `users` (zaměstnanecké účty).

- **Retence** ([`src/lib/privacy/retention.ts`](../src/lib/privacy/retention.ts)) — jedna implementace pro cron i ruční spuštění z `/admin/privacy`. Poptávky se mažou podle `updated_at` (ne `created_at`: deduplikace řádek aktualizuje, takže lhůta má běžet od poslední interakce), zpětná vazba podle `created_at`. Při `retention_enabled = false` funkce nemaže nic a vrací `{ skipped: true }` — výchozí stav po migraci, aby nasazení nikdy nesmazalo data dřív, než správce lhůty potvrdí.
- **Práva subjektu** ([`src/lib/privacy/subject.ts`](../src/lib/privacy/subject.ts)) — vyhledání podle kontaktu, JSON export (čl. 15/20) a trvalý výmaz (čl. 17) v `/admin/privacy`. Výmaz jde v pořadí `feedback` → `leads`, protože `session_id` z poptávky je jediná cesta ke zpětné vazbě; opačné pořadí by osiřelé řádky s textem dotazu nechalo v DB navždy. Totožnost žadatele ověřuje obsluha, ne aplikace.
- **Známé omezení dohledatelnosti:** hlas bez navazující poptávky (jiné zařízení, jiná session) nelze s osobou spárovat — pseudonymní data bez účtu prostě nejdou dohledat.
- **Normalizace kontaktu** ([`src/lib/privacy/contact.ts`](../src/lib/privacy/contact.ts)) je sdílená se zápisem poptávky; kdyby se rozešly, žádost o výmaz by skončila jako „nic nenalezeno". Telefon se navíc **hledá** i ve variantě s předvolbou a bez ní — zápis dál ukládá jedinou podobu.
- **Auditní stopa** `privacy_actions` nese jen **HMAC otisk** kontaktu, nikdy kontakt sám: prostý SHA-256 by byl u telefonních čísel slovníkově prolomitelný, takže by evidence sama byla dalším zpracováním osobních údajů.
- **Oddělené ukládání retence:** retenční pole nejsou v `ALL_NUMERIC_FIELDS`/`ALL_TOGGLE_FIELDS`, takže `POST /api/settings` je nezapisuje a „Obnovit výchozí" na stránce RAG parametrů nemůže vypnout retenci. Hranici drží typy (`RagNumericKey` vs. `RetentionNumericKey`), ne konvence.

## 7. Runtime konfigurace

Parametry se ladí za běhu v `/admin/parameters` (+ podsekce `/admin/parameters/prompts`), ukládají do `app_settings` a čtou při každém requestu (`getSettings()`, záměrně bez cache). Při nedostupné DB se použijí env fallbacky (`TOP_K`, `SIMILARITY_THRESHOLD`, `LLM_TEMPERATURE`).

**Zásadní rozdíl v okamžiku účinku:**

- **Při dotazu** (změna okamžitá): `top_k` (1–20), `similarity_threshold` (0–1), `llm_temperature` (0–1), prompt overridy, přepínače telemetrie.
- **Při uploadu**: `default_document_visibility` (`public`/`restricted`) — výchozí viditelnost nově nahraného dokumentu, tedy provozní režim celé báze: `public` = veřejná znalostní báze (dnešní chování), `restricted` = interní báze, kde se obsah bez štítku nikomu nezobrazí. Existující dokumenty se přepnutím nemění.
- **Při indexaci** (projeví se až reindexací): `chunk_target_size` (1500–6000 znaků), `chunk_breadcrumb`, `chunk_strip_headers`. Tabulka dokumentů porovnává `chunking_config` s aktuálním nastavením a u zastaralých nabízí Reindexovat.

**Prompt overridy:** sloupce `system_prompt`/`lead_summary_prompt` jsou záměrně nullable — NULL znamená „použij výchozí konstantu z kódu" ([`src/lib/rag/prompts.ts`](../src/lib/rag/prompts.ts)), takže vylepšení defaultů se propisují s deployi. Override vzniká jen editací v adminu; „Obnovit výchozí" vrací NULL.

## 8. Observabilita a evaluace

**Tracing (OTel → Langfuse):**

- [`src/instrumentation.ts`](../src/instrumentation.ts) registruje `NodeTracerProvider` + `LangfuseSpanProcessor` jednou při startu; bez Langfuse klíčů se neregistruje nic.
- [`src/lib/telemetry.ts`](../src/lib/telemetry.ts) — singleton procesoru, `withSpan`/`getTracer`/`flushTelemetry`; bez klíčů no-op.
- [`src/lib/langfuse-score.ts`](../src/lib/langfuse-score.ts) — zápis skóre `user-thumbs` přes REST klienta (`@langfuse/client`); záměrně mimo `telemetry.ts`, který je čistě o OTel a načítá se už při startu z `instrumentation.ts`. Líný singleton, fail-open, bez klíčů no-op.
- Instrumentované cesty: chat (`chat-pipeline` → `retrieval` → `embed.query`/`vector-search` + LLM span z AI SDK), shrnutí poptávek (`lead.summarize`), indexace (`document.process` → download/extract/clean/chunk/embed-batch/insert-chunks), upload, retrieval-test. `functionId` v AI SDK telemetrii: `chat-rag` a `lead-summarize`.
- Na Vercelu `exportMode: "immediate"` — batched režim ztrácel spany končící po dostreamování (funkce zmrzne dřív, než se batch odešle). Rodičovský span chatu se ukončuje až v `onFinish`/`onError`/`onAbort` streamu.
- **Soukromí:** default se neposílá obsah dotazů/odpovědí, jen metadata (tokeny, latence, parametry, počty chunků). Obsah zapíná runtime přepínač `record_content`; master vypínač `telemetry_enabled` zastaví export úplně. Z promptu se posílá **jen otisk, nikdy text**.

**Identita trace a produkční zpětná vazba** (4. 8. 2026 — plán „headless Langfuse", etapy 2–4):

| Co | Kde vzniká | K čemu |
|---|---|---|
| `langfuse.trace.name` = `chat-rag` | atribut spanu `chat-pipeline` | traces byly dřív nepojmenované (`name: ""`) a nešly filtrovat |
| `langfuse.session.id` | nepovinné `sessionId` v těle `/api/chat` (`parseSessionId`, ≤ 64 zn.) | seskupení konverzace v Sessions view |
| hlavička `X-Trace-Id` | `span.spanContext().traceId`; vrací se v **obou** větvích (stream i fallback) | klient si drží `ChatMessage.traceId` a přiloží ho ke zpětné vazbě |
| skóre `user-thumbs` (`BOOLEAN`, 1/0) | `POST /api/feedback` → `recordUserThumbs()` v `after()` | poprvé měřitelná kvalita na **produkčním provozu**, ne jen na eval datasetech |
| `prompt_hash` + `prompt_source` | `langfuse.trace.metadata.*` na `chat-pipeline` | porovnání skóre napříč verzemi promptu bez migrace do Prompt Managementu |

Zásady, které tato vrstva dodržuje:

- **Telemetrie nesmí ovlivnit odpověď** — nevalidní `sessionId` i `traceId` se tiše ignorují, zápis skóre je fail-open a běží v `after()`.
- **Supabase zůstává zdrojem pravdy** pro zpětnou vazbu; Langfuse je druhý konzument, ne náhrada.
- **Idempotence skóre** přes deterministické `id` (`thumbs:<sessionId>:<messageIndex>`) — přehlasování skóre přepíše, nezaloží duplicitu (odpovídá upsertu v DB).
- Atributy dnes nese **trace, ne child observations**; filtrování observations podle session by vyžadovalo `propagateAttributes()` z `@langfuse/tracing`. Metadata promptu jsou schválně na trace, protože tam sedí i skóre — jinak by korelace „verze promptu × hodnocení" nešla.

**Evaluace (`npm run eval`):** [`scripts/langfuse-eval.mjs`](../scripts/langfuse-eval.mjs) prožene otázky z Langfuse datasetů nasazeným `/api/chat` a založí experiment s deterministickými skóre (`fallback_correct`, `retrieved`, `doc_match`, `article_match`, `offer_correct` — kontrola tokenu `[[NABIDKA]]`). LLM-as-judge „Correctness in Czech" běží v Langfuse. Zdrojová CSV a postup: [evaluation/langfuse_datasets/](evaluation/langfuse_datasets/).

## 9. Frontend chat UI — fullscreen + widget

Chatová logika je sdílená mezi dvěma vstupními body přes jeden hook, aby se oprava/úprava chatu propsala do obou:

| Modul | Odpovědnost |
|---|---|
| [`src/lib/use-kecalo-chat.ts`](../src/lib/use-kecalo-chat.ts) | hook `useKecaloChat()` — stav zpráv, streamování z `POST /api/chat`, strip tokenu `[[NABIDKA]]`, `getSessionId` (localStorage `kecalo_session_id`) posílaný do chatu pro telemetrii, čtení `X-Trace-Id` do `ChatMessage.traceId` a jeho přiložení ke zpětné vazbě, nová konverzace s abortem, auto-scroll |
| [`src/components/ChatMessages.tsx`](../src/components/ChatMessages.tsx) | scrollovatelná oblast zpráv (prázdný stav, vzorové otázky, mapování na `MessageBubble`); prop `compact` pro menší widget layout |
| [`src/app/page.tsx`](../src/app/page.tsx) | `/` — fullscreen chat, skelet nad `useKecaloChat()` + `<ChatMessages />` |
| [`src/components/ChatWidget.tsx`](../src/components/ChatWidget.tsx) | vysouvací widget (bublina v rohu → panel `380×600px`, vždy namountovaný, minimalizace čistě CSS + `inert`); `useKecaloChat()` žije v komponentě, takže konverzace i běžící stream přežijí minimalizaci |
| [`src/app/demo/page.tsx`](../src/app/demo/page.tsx) | `/demo` — statická demo stránka „Pojišťovny Jistota" s `<ChatWidget />`, simuluje nasazení na reálném webu; veřejná, mimo proxy vrstvu |

`MessageBubble.tsx` vrací `null` pro prázdný `content` (asistentská zpráva těsně po odeslání, než dorazí první token) — jinak by se zobrazila prázdná bublina zároveň s „píšícími" tečkami z `ChatMessages`.

Widget nepřidává žádnou útočnou plochu ani API — používá výhradně existující veřejné routy (`/api/chat`, `/api/feedback`, `POST /api/leads`) se stávajícími rate limity. Detailní plán a průběh ověření: [plans/widget_mini_kecalo_plan.md](plans/widget_mini_kecalo_plan.md).

## 10. Známá omezení

- **Bez automatizovaných testů** — v repozitáři není žádná test suite; ověřuje se manuálně (`npm run build`, `npm run lint`, E2E průchody v prohlížeči, `npm run eval` nad Langfuse datasety). Regrese se tedy zachytí až při ručním průchodu — před ostrým provozem první věc k doplnění.
- **Autentizace** — identity, aplikační role i SSO existují, ale zbývá: napojení na **reálný IdP** (ověřeno jen proti `scripts/mock-idp.mjs`), obnova zapomenutého hesla bez zásahu admina a MFA u lokálních účtů.
- **Koncoví tazatelé chatu se nepřihlašují** — štítky dokumentů proto chrání obsah hlavně před veřejností; uvnitř organizace se rozlišení projeví až tam, kde je uživatel přihlášený.
- **In-memory rate limity** — per instance; na serverless škálování napříč instancemi nedrží globální stropy přesně (dokumentované zmírnění, ne eliminace).
- **SEC-7 / SEC-8** — historie chatu jde z klienta (důvěra v klientský přepis), chybí CSRF token; vědomě odloženo.
- **Deduplikace leadů** — podle přesné shody kontaktu v rámci typu; nepokrývá varianty zápisu.
- **Náklady modelů v Langfuse** — `voyage-3.5` a `mistral-small-latest` je třeba definovat v Langfuse Settings → Models, jinak se cena počítá jako 0.
- **Telemetrická identita jen na trace** — `session.id` a metadata promptu nese trace, ne child observations; filtrování observations podle session by vyžadovalo `propagateAttributes()`.
- **Zpětná vazba na dvou místech** — hlas se zapisuje do Supabase (zdroj pravdy) i do Langfuse (skóre `user-thumbs`). Zápis do Langfuse je fail-open, takže při jeho výpadku data dočasně divergují; Supabase zůstává úplná.
- **Faithfulness judge zatím nelze nasadit** — kontext je v traces slepený se systémovým promptem v jednom stringu a variable mapping umí jen JSONPath, ne extrakci ze stringu (řešení: poslat kontext samostatně do metadat).
