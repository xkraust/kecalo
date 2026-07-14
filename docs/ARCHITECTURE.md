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
3. **Retrieval** — `retrieve(query, topK, threshold)`: embedding dotazu (Voyage) → Postgres RPC `match_chunks` (migrace `002` + `007`). **Práh podobnosti se uplatňuje v SQL**, ne v JS; funkce vrací jen chunky z dokumentů ve stavu `ready`.
4. **Fallback** — 0 chunků → statická `text/plain` odpověď `FALLBACK_MESSAGE` s prázdným `X-Sources`; Claude se nevolá.
5. **Generování** — `buildContextBlock` složí `<document>` bloky (zdroj, sekce, strana) do system promptu (runtime override `settings.systemPrompt ?? SYSTEM_PROMPT`); historie ořezaná na posledních 8 zpráv; `streamText` s `maxOutputTokens: 1500`, teplotou z nastavení a `abortSignal` (odpojení klienta zastaví generování).
6. **Zdroje** — metadata (filename ≤ 80 zn., section ≤ 100 zn., strana, zaokrouhlená similarity) v hlavičce `X-Sources` (URL-encoded JSON); nad 8 000 znaků se sekce vynechají (limit velikosti hlaviček).
7. **Token `[[NABIDKA]]`** — system prompt instruuje model přidat ho na konec odpovědi u produktových dotazů; klient token odstraní a vykreslí kartu poptávky (`LeadForm`).

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

Schéma se mění **výhradně migracemi** v `supabase/migrations/` (`001`–`013`), nikdy ručně v SQL editoru. Aplikace přistupuje service-role klíčem (obchází RLS); RLS je na tabulkách zapnuté bez policy pro anon — přímý anonymní přístup je tak zablokovaný.

| Tabulka | Účel |
|---|---|
| `documents` | metadata dokumentu: `filename`, `status` (`uploaded/processing/ready/error`), `chunk_count`, `error_message`, `chunking_config` (otisk parametrů poslední indexace) |
| `chunks` | `content`, `embedding vector(1024)` s HNSW indexem, `page`, `section_path` (cesta v hierarchii), `chunk_index`, `batch_id` (identifikátor indexačního běhu), FK na `documents` s CASCADE |
| `app_settings` | jednořádková konfigurace (id = 1): RAG parametry, přepínače telemetrie, parametry chunkování, prompt overridy (`system_prompt`/`lead_summary_prompt`, NULL = výchozí z kódu) |
| `feedback` | palec nahoru/dolů; UNIQUE (session_id, message_index) — jeden hlas na zprávu |
| `leads` | poptávky: kontakt (CHECK aspoň email nebo telefon), `summary` (Mistral shrnutí konverzace), `status` (`new/updated/in_progress/closed`), `type` (`produkt`/`hodnoceni`), `consent`; deduplikace podle kontaktu v rámci téhož typu; nemažou se |
| `auth_state` | jednořádková: `sessions_invalid_before` — server-side revokace admin session po logoutu |

CHECK constrainty v migracích zrcadlí rozsahy definované v [`src/lib/settings-meta.ts`](../src/lib/settings-meta.ts) (jediný zdroj pravdy pro validaci; DB je druhá obranná linie).

## 5. API

**Veřejné routy** (bez autentizace, s rate limity na IP):

| Routa | Účel | Limit |
|---|---|---|
| `POST /api/chat` | RAG pipeline → streamovaná odpověď + `X-Sources` | 20/min |
| `POST /api/feedback` | uložení hlasu palec nahoru/dolů | 10/min |
| `POST /api/leads` | uložení poptávky + Mistral shrnutí + deduplikace | 5/min |
| `POST /api/auth/login`, `/api/auth/logout` | přihlášení/odhlášení admina | login 5 pokusů / 15 min |

**Admin routy** (session cookie; bez ní 401): `GET/POST /api/documents`, `DELETE /api/documents/[id]`, `POST /api/documents/[id]/reprocess`, `PATCH /api/leads/[id]`, `GET/POST /api/settings`, `POST /api/retrieval-test`.

## 6. Bezpečnost

Autentizace je **na úrovni prototypu** (ne JWT, ne SSO) — vědomé rozhodnutí. Detailní nálezy a opravy: [reviews/security_issues.md](reviews/security_issues.md) + [reviews/security_correction_plan.md](reviews/security_correction_plan.md).

- **Session:** cookie `ts.nonce.sig` podepsaná HMAC-SHA256 klíčem `SESSION_SECRET` (nikdy heslem), platnost 8 h, ověření constant-time (`crypto.subtle.verify`). Viz [`src/lib/auth.ts`](../src/lib/auth.ts).
- **Dvě obranné linie:** proxy vrstva [`src/proxy.ts`](../src/proxy.ts) (edge — podpis + expirace) chrání `/admin` stránky i admin API; každý admin handler navíc volá `requireAdmin()` ([`src/lib/require-admin.ts`](../src/lib/require-admin.ts)) — 401 i při obejití proxy (SEC-2).
- **Revokace session (SEC-4):** logout posune `auth_state.sessions_invalid_before` na `now()` — starší tokeny jsou odmítnuty i před expirací. Kontroluje se v Node runtimu (`requireAdmin()` + admin layout); fail-open při chybějící tabulce.
- **Login:** constant-time porovnání údajů (`safeEqual`), rate limit 5 pokusů / 15 min na IP + globální strop 30 selhání / 15 min přes všechny IP (SEC-1 — nezávislé na spoofovatelné IP).
- **Identita klienta:** `x-real-ip` (na Vercelu dosazuje platforma), fallback pravá hodnota `x-forwarded-for`; levá (spoofovatelná) se nepoužívá.
- **Prompt injection do admin UI (SEC-9):** přepis konverzace jde do promptu shrnutí izolovaný v bloku `<transcript>` jako nedůvěryhodná data; wrapping a sanitizace jsou v kódu, nezávisle na editovatelném promptu.
- **Vědomý dluh:** SEC-7 (serverová historie chatu) a SEC-8 (CSRF token) odloženy jako produkční dluh.

## 7. Runtime konfigurace

Parametry se ladí za běhu v `/admin/parameters` (+ podsekce `/admin/parameters/prompts`), ukládají do `app_settings` a čtou při každém requestu (`getSettings()`, záměrně bez cache). Při nedostupné DB se použijí env fallbacky (`TOP_K`, `SIMILARITY_THRESHOLD`, `LLM_TEMPERATURE`).

**Zásadní rozdíl v okamžiku účinku:**

- **Při dotazu** (změna okamžitá): `top_k` (1–20), `similarity_threshold` (0–1), `llm_temperature` (0–1), prompt overridy, přepínače telemetrie.
- **Při indexaci** (projeví se až reindexací): `chunk_target_size` (1500–6000 znaků), `chunk_breadcrumb`, `chunk_strip_headers`. Tabulka dokumentů porovnává `chunking_config` s aktuálním nastavením a u zastaralých nabízí Reindexovat.

**Prompt overridy:** sloupce `system_prompt`/`lead_summary_prompt` jsou záměrně nullable — NULL znamená „použij výchozí konstantu z kódu" ([`src/lib/rag/prompts.ts`](../src/lib/rag/prompts.ts)), takže vylepšení defaultů se propisují s deployi. Override vzniká jen editací v adminu; „Obnovit výchozí" vrací NULL.

## 8. Observabilita a evaluace

**Tracing (OTel → Langfuse):**

- [`src/instrumentation.ts`](../src/instrumentation.ts) registruje `NodeTracerProvider` + `LangfuseSpanProcessor` jednou při startu; bez Langfuse klíčů se neregistruje nic.
- [`src/lib/telemetry.ts`](../src/lib/telemetry.ts) — singleton procesoru, `withSpan`/`getTracer`/`flushTelemetry`; bez klíčů no-op.
- Instrumentované cesty: chat (`chat-pipeline` → `retrieval` → `embed.query`/`vector-search` + LLM span z AI SDK), indexace (`document.process` → download/extract/clean/chunk/embed-batch/insert-chunks), upload, retrieval-test.
- Na Vercelu `exportMode: "immediate"` — batched režim ztrácel spany končící po dostreamování (funkce zmrzne dřív, než se batch odešle). Rodičovský span chatu se ukončuje až v `onFinish`/`onError`/`onAbort` streamu.
- **Soukromí:** default se neposílá obsah dotazů/odpovědí, jen metadata (tokeny, latence, parametry, počty chunků). Obsah zapíná runtime přepínač `record_content`; master vypínač `telemetry_enabled` zastaví export úplně.

**Evaluace (`npm run eval`):** [`scripts/langfuse-eval.mjs`](../scripts/langfuse-eval.mjs) prožene otázky z Langfuse datasetů nasazeným `/api/chat` a založí experiment s deterministickými skóre (`fallback_correct`, `retrieved`, `doc_match`, `article_match`, `offer_correct` — kontrola tokenu `[[NABIDKA]]`). LLM-as-judge „Correctness in Czech" běží v Langfuse. Zdrojová CSV a postup: [evaluation/langfuse_datasets/](evaluation/langfuse_datasets/).

## 9. Frontend chat UI — fullscreen + widget

Chatová logika je sdílená mezi dvěma vstupními body přes jeden hook, aby se oprava/úprava chatu propsala do obou:

| Modul | Odpovědnost |
|---|---|
| [`src/lib/use-kecalo-chat.ts`](../src/lib/use-kecalo-chat.ts) | hook `useKecaloChat()` — stav zpráv, streamování z `POST /api/chat`, strip tokenu `[[NABIDKA]]`, `getSessionId` (localStorage `kecalo_session_id`), feedback, nová konverzace s abortem, auto-scroll |
| [`src/components/ChatMessages.tsx`](../src/components/ChatMessages.tsx) | scrollovatelná oblast zpráv (prázdný stav, vzorové otázky, mapování na `MessageBubble`); prop `compact` pro menší widget layout |
| [`src/app/page.tsx`](../src/app/page.tsx) | `/` — fullscreen chat, skelet nad `useKecaloChat()` + `<ChatMessages />` |
| [`src/components/ChatWidget.tsx`](../src/components/ChatWidget.tsx) | vysouvací widget (bublina v rohu → panel `380×600px`, vždy namountovaný, minimalizace čistě CSS + `inert`); `useKecaloChat()` žije v komponentě, takže konverzace i běžící stream přežijí minimalizaci |
| [`src/app/demo/page.tsx`](../src/app/demo/page.tsx) | `/demo` — statická demo stránka „Pojišťovny Jistota" s `<ChatWidget />`, simuluje nasazení na reálném webu; veřejná, mimo proxy vrstvu |

`MessageBubble.tsx` vrací `null` pro prázdný `content` (asistentská zpráva těsně po odeslání, než dorazí první token) — jinak by se zobrazila prázdná bublina zároveň s „píšícími" tečkami z `ChatMessages`.

Widget nepřidává žádnou útočnou plochu ani API — používá výhradně existující veřejné routy (`/api/chat`, `/api/feedback`, `POST /api/leads`) se stávajícími rate limity. Detailní plán a průběh ověření: [plans/widget_mini_kecalo_plan.md](plans/widget_mini_kecalo_plan.md).

## 10. Známá omezení

- **Autentizace prototypu** — jedna admin identita, HMAC cookie; pro produkci nahradit plnohodnotnou auth (SSO/JWT).
- **In-memory rate limity** — per instance; na serverless škálování napříč instancemi nedrží globální stropy přesně (dokumentované zmírnění, ne eliminace).
- **SEC-7 / SEC-8** — historie chatu jde z klienta (důvěra v klientský přepis), chybí CSRF token; vědomě odloženo.
- **Deduplikace leadů** — podle přesné shody kontaktu v rámci typu; nepokrývá varianty zápisu.
- **Náklady modelů v Langfuse** — `voyage-3.5` a `mistral-small-latest` je třeba definovat v Langfuse Settings → Models, jinak se cena počítá jako 0.
