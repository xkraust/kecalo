# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Pracovní postup

Po dokončení každého kroku v rámci libovolné fáze implementace (viz `docs/IMPLEMENTATION_PLAN.md`) aktualizuj tento soubor CLAUDE.md — doplň nebo oprav sekce, které daný krok ovlivnil. CLAUDE.md musí vždy odrážet aktuální stav projektu, stejně tak aktualizuj implementační plán (`docs/IMPLEMENTATION_PLAN.md`), zaškrtni všechny kroky, které jsou hotové. Pokud při implemntaci vznikne potřeba implementační plán doplnit či pozměnit, oznam tuto skutečnost uživateli, navrhni změnu a počkej na souhlas. Po dokončení každé fáze nebo vetšího kroku se zeptej, zda se má provést push a commit.

## Stav projektu

Fáze 0–7 hotovy. Fáze 8 (admin sekce **Parametry** — globální runtime parametry RAG) je hotová a ověřená (lint, build, E2E v prohlížeči, perzistence přes `/api/settings`); migrace `003_app_settings.sql` je aplikovaná na Supabase. Fáze 9 (Langfuse — observabilita přes OpenTelemetry) implementována (lint, build OK, chat ověřen v runtime); export traces do Langfuse Cloud vyžaduje restart serveru (načtení `instrumentation.ts`). Fáze 10 (zpětná vazba uživatelů — thumbs up/down) implementována (lint, build OK, E2E v prohlížeči); migrace `005_feedback.sql` čeká na `supabase db push`. Fáze 11 (admin podsekce **Telemetrie** — runtime přepínače observability) hotová a ověřená end-to-end (lint, build, záznam obsahu i kompletní traces v Langfuse z nasazené app); migrace `006_telemetry_settings.sql` aplikovaná. Na Vercel serverless se používá `exportMode: "immediate"` (jinak se ztrácely pozdní spany). Fáze 12 (strukturní chunkování — dělení podle článků/odstavců, breadcrumb hlavičky, `section_path`) je **hotová a ověřená end-to-end**: migrace `007_chunk_sections.sql` aplikovaná, seed dokumenty (M-100, M-200, IPID) reindexované novým chunkerem (57 + 59 + 2 chunků), porovnání na testovacích otázkách: top similarity ↑ u 10/11 věcných otázek, „ekologický benefit" 0,363 → 0,441, top-1 míří na správné články. Zbývá z ladění RAG: `Informace pro klienta.pdf` není v DB nahraná (uživatel nahraje přes admin UI) a fallback otázky mimo bázi dál vracejí chunky nad prahem 0,35 (čisté odmítnutí zajišťuje systémový prompt; případně zvýšit práh v `/admin/parameters`). Fáze 13 (admin podsekce **Chunkování** + reindexace bez re-uploadu) je **implementovaná** (lint, build OK); migrace `008_chunking_settings.sql` **čeká na `supabase db push`** — dokud neproběhne, ukládání parametrů a seznam dokumentů selžou (select/update nových sloupců). Po migraci zbývá E2E v prohlížeči a A/B experiment breadcrumb hlaviček. Průběžný stav sleduj v `docs/IMPLEMENTATION_PLAN.md`.

## Projekt

**Kecalo** je prototyp RAG chatbota pro pojišťovnu, vytvořený jako projekt jednodenního kurzu vibecodingu. V UI vystupuje jako „Pojišťovna Jistota", znalostní báze ale čerpá z reálných dokumentů Kooperativy ze složky `docs/`. Uživatelé kladou otázky česky k pojistným produktům; bot odpovídá výhradně z indexovaných dokumentů a vždy uvádí zdroj.

## Technologický stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript, adresářová struktura se `src/`
- **UI:** Tailwind CSS v4 (konfigurace přes `@theme` v `globals.css`, bez `tailwind.config.ts`) + shadcn/ui
- **AI orchestrace:** Vercel AI SDK (`useChat`, streamování)
- **LLM:** Claude API — `claude-sonnet-4-6`
- **Embeddingy:** Voyage AI — `voyage-3.5` (1024 dimenzí)
- **Vektorová DB + úložiště:** Supabase (Postgres + rozšíření pgvector + Storage)
- **Parsování PDF:** `unpdf`

## Vzhled a design

UI vychází vizuálně z Anthropic Console (`platform.claude.com`). Výchozí režim je **světlý**, bez tmavého přepínače.

- **Admin (`/admin`)** — přesně ve stylu Console: levý sidebar (Přehled · Dokumenty · Test retrievalu · Parametry · Chat · Odhlásit), krémové pozadí, korálový akcent, čisté white karty. Úvodní strana `/admin` je dashboard s přehledem znalostní báze (metrické karty + grafy).
- **Chat (`/`)** — odvozený vzhled: stejná paleta a typografie, ale s vlastním logem a brandem „Pojišťovna Jistota".

Dashboard zobrazuje statistiky znalostní báze (počet dokumentů, chunků, zaindexovaných stran, rozpad stavů, chunky podle dokumentu) počítané přímo z tabulek `documents`/`chunks`. Metriky využití (dotazy, míra fallbacku, prům. skóre, latence) jsou odložené — vyžadují logování dotazů (viz produkční dluh).

### Designové tokeny (CSS proměnné v `src/app/globals.css` přes Tailwind v4 `@theme`, shadcn/ui je přes ně tématuje)

| Token | Hodnota | Použití |
|---|---|---|
| Pozadí stránky | `#FAF9F5` | `body`, hlavní plocha |
| Povrch / karta | `#FFFFFF` | karty, tabulky, panely |
| Text primární | `#1A1A18` | nadpisy, hlavní text |
| Text sekundární | `#6B6A63` | popisky, metadata |
| Okraj | `rgba(0,0,0,0.10)` | borders 0.5–1px |
| Akcent (korál) | `#D85A30` | primární tlačítka, aktivní položky |
| Akcent hover | `#C24E29` | hover stav |
| Akcent podklad | `#FAECE7` | aktivní položka sidebaru, badge |
| Status `ready` | text `#0F6E56` / pozadí `#E1F5EE` | zelený badge |
| Status `processing` | text `#854F0B` / pozadí `#FAEEDA` | žlutý badge |
| Status `uploaded` | text `#5F5E5A` / pozadí `#F1EFE8` | šedý badge |
| Status `error` | text `#A32D2D` / pozadí `#FCEBEB` | červený badge |

### Typografie

- **Sans (UI):** `Inter` přes `next/font/google` (volná náhrada za Console „Styrene"), váhy 400 a 500.
- **Serif (nepovinně, velké nadpisy):** volná náhrada `Fraunces` / `Source Serif 4`; pro prototyp lze vynechat.
- Sentence case, žádné ALL CAPS, dvě váhy (400/500).

## Příkazy

### Vývoj

```bash
npm run dev          # dev server na localhost:3000
npm run build        # produkční build
npm run lint         # ESLint
```

### Databáze

```bash
supabase init                    # jednorázová inicializace Supabase projektu
supabase db push                 # aplikuje migrace na Supabase (vyžaduje DATABASE_URL)
```

Všechny změny DB schématu jdou výhradně přes migrační soubory v `supabase/migrations/` — nikdy neprovádět ruční úpravy v SQL editoru Supabase. Aktuální migrace: `001_init.sql` (tabulky `documents`/`chunks` + HNSW index), `002_match_chunks.sql` (RPC `match_chunks` použité při retrievalu), `003_app_settings.sql` (jednořádková tabulka `app_settings` s runtime parametry RAG), `005_feedback.sql` (tabulka `feedback`), `006_telemetry_settings.sql` (`app_settings` += `telemetry_enabled`, `record_content`) `007_chunk_sections.sql` (`chunks` += `section_path`; `match_chunks` ji nově vrací — funkce se kvůli změně návratového typu dropuje a vytváří znovu) a `008_chunking_settings.sql` (`app_settings` += `chunk_target_size`/`chunk_breadcrumb`/`chunk_strip_headers`, `documents` += `chunking_config`).

### Scaffold projektu (fáze 1, jednorázové)

```bash
npx create-next-app@latest kecalo --typescript --tailwind --app --src-dir
npx shadcn@latest init
npx shadcn@latest add button input textarea card badge dialog table
npm i ai @ai-sdk/anthropic @supabase/supabase-js voyageai unpdf react-markdown
```

## Proměnné prostředí

Úplný seznam viz `.env.example`. Povinné klíče:

| Proměnná | Účel |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API (pouze server) |
| `VOYAGE_API_KEY` | Voyage AI embeddingy (pouze server) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase projektu (může být veřejná) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin klíč Supabase (pouze server, nikdy na klienta) |
| `DATABASE_URL` | Postgres connection string pro migrace |
| `ADMIN_USERNAME` | Uživatelské jméno pro admin (povinné) |
| `ADMIN_PASSWORD` | Heslo pro admin sekci |
| `TOP_K` | Výchozí počet výsledků z retrievalu (5) |
| `SIMILARITY_THRESHOLD` | Výchozí práh kosinové podobnosti (0.35) |
| `LLM_TEMPERATURE` | Výchozí teplota Claude (0.2) |
| `LANGFUSE_SECRET_KEY` | Langfuse server klíč (volitelný — bez něj app funguje, jen se neloguje) |
| `LANGFUSE_PUBLIC_KEY` | Langfuse veřejný klíč (volitelný) |
| `LANGFUSE_BASE_URL` | URL Langfuse instance (default `https://cloud.langfuse.com`) |

`TOP_K`, `SIMILARITY_THRESHOLD` a `LLM_TEMPERATURE` jsou jen **výchozí / fallback** hodnoty: runtime hodnoty se čtou z tabulky `app_settings` (editovatelné v `/admin/parameters`). Když tabulka chybí nebo je DB nedostupná, použijí se tyto env defaulty (viz `lib/settings.ts`).

## Architektura

### Stránky a API routy

```
/                       → Chat UI (hook useChat, streamování, blok zdrojů, disclaimer)
/admin                  → Dashboard (přehled znalostní báze — metrické karty + grafy)
/admin/documents        → Upload + tabulka dokumentů
/admin/retrieval-test   → Panel test retrievalu
/admin/parameters       → Globální parametry RAG (slidery TOP_K, práh podobnosti, teplota)
/admin/login            → Login (uživatelské jméno + heslo), nastaví session cookie

POST   /api/chat                → RAG pipeline → streamovaná odpověď + metadata zdrojů
POST   /api/documents           → upload → extrakce → chunking → embeddingy → uložení
GET    /api/documents           → seznam dokumentů se stavem
DELETE /api/documents/[id]      → smazání dokumentu, chunků (CASCADE), souboru v Storage
POST   /api/documents/[id]/reprocess → reindexace bez re-uploadu (aktuální parametry chunkování)
POST   /api/retrieval-test      → vrátí top-k chunků se skóre (pouze admin)
GET    /api/settings            → vrátí aktuální runtime parametry + přepínače telemetrie z DB
POST   /api/settings            → uloží globální runtime parametry RAG do app_settings
POST   /api/feedback            → uloží zpětnou vazbu (thumbs up/down) do tabulky feedback
POST   /api/auth/login          → ověření username + password, nastavení session cookie
POST   /api/auth/logout         → smazání session cookie
```

### Cílová adresářová struktura

```
src/
├── middleware.ts                     # ochrana /admin (kontrola session cookie)
├── instrumentation.ts                # registrace OTel provideru + Langfuse processoru (Node.js runtime)
├── app/
│   ├── page.tsx                      # Chat UI
│   ├── admin/
│   │   ├── login/page.tsx            # Login (mimo route group — nechráněno)
│   │   └── (authenticated)/         # route group chráněná middlewarem
│   │       ├── layout.tsx            # Sidebar layout (Console styl)
│   │       ├── page.tsx              # Dashboard (přehled znalostní báze)
│   │       ├── documents/page.tsx    # server část (načtení dokumentů)
│   │       ├── documents/client.tsx  # klientská část (upload + tabulka)
│   │       ├── retrieval-test/page.tsx
│   │       ├── parameters/page.tsx    # server část (getSettings)
│   │       └── parameters/client.tsx  # klientská část (slidery + uložení)
│   └── api/
│       ├── chat/route.ts
│       ├── documents/route.ts
│       ├── documents/[id]/route.ts
│       ├── documents/[id]/reprocess/route.ts  # reindexace bez re-uploadu
│       ├── retrieval-test/route.ts
│       ├── settings/route.ts
│       ├── feedback/route.ts
│       └── auth/{login,logout}/route.ts
├── components/
│   ├── MessageBubble.tsx
│   ├── SourcesBlock.tsx
│   ├── UploadZone.tsx
│   ├── DocumentsTable.tsx
│   ├── AdminSidebar.tsx              # navigace admin sekce
│   ├── StatusBadge.tsx               # badge stavu dokumentu
│   ├── StatCard.tsx                  # metrická karta dashboardu
│   ├── FeedbackCard.tsx              # karta spokojenosti (% + poměrový pruh)
│   ├── ChunksByDocChart.tsx          # graf chunků (CSS bary)
│   └── ui/                           # shadcn/ui primitiva
└── lib/
    ├── config.ts                     # konstanty z env, default hodnoty
    ├── telemetry.ts                  # OTel: singleton span processoru + withSpan/getTracer/flushTelemetry
    ├── supabase.ts                   # Supabase client (service role)
    ├── auth.ts                       # podpis/ověření session cookie (HMAC)
    ├── settings.ts                   # server: getSettings/saveSettings (app_settings)
    ├── settings-meta.ts              # sdílená metadata + validace parametrů (klient i server)
    ├── types.ts                      # sdílené TS typy
    ├── utils.ts                      # cn() helper (shadcn)
    └── rag/
        ├── extract.ts
        ├── clean.ts                  # čištění textu (záhlaví/patičky, slepení řádků)
        ├── chunk.ts                  # strukturní chunkování (parser + skladač)
        ├── embed.ts
        ├── retrieve.ts
        ├── prompts.ts                # systémový prompt, fallback, kontext blok
        └── pipeline.ts               # indexace dokumentu (processDocument)
supabase/
└── migrations/
    ├── 001_init.sql                  # tabulky documents/chunks + HNSW index
    ├── 002_match_chunks.sql          # RPC match_chunks (retrieval)
    ├── 003_app_settings.sql          # tabulka app_settings (runtime parametry RAG)
    ├── 005_feedback.sql              # tabulka feedback (zpětná vazba thumbs up/down)
    ├── 006_telemetry_settings.sql    # app_settings += telemetry_enabled, record_content
    ├── 007_chunk_sections.sql        # chunks += section_path, match_chunks vrací sekci
    └── 008_chunking_settings.sql     # app_settings += chunk_*, documents += chunking_config
```

### RAG — dvě oddělené pipeline

**Pozor na rozdělení odpovědností:** `src/lib/rag/pipeline.ts` NENÍ dotazovací (chat) pipeline — je to **indexační (ingestion) pipeline**. Chat pipeline žije v `src/app/api/chat/route.ts` ve spojení s `prompts.ts`.

#### Indexace dokumentu — `pipeline.ts` (`processDocument`)
Spouští se z `POST /api/documents` po uploadu a z `POST /api/documents/[id]/reprocess` (reindexace). Načte runtime parametry chunkování (`getSettings()`) → stáhne soubor ze Storage → `extract.ts` → `clean.ts` → `chunk.ts` (s `docTitle` = název souboru bez přípony) → `embed.ts` → smaže staré chunky dokumentu → vloží nové po dávkách 100 → nastaví `status` dokumentu (`processing` → `ready` / `error`) a uloží otisk konfigurace do `documents.chunking_config`. Chyby se zachytí a uloží do `documents.error_message`.

#### Dotaz / chat — `api/chat/route.ts` + `prompts.ts`
`retrieve(query)` → pokud `chunks.length === 0` fallback (viz níže), jinak `buildContextBlock` vloží chunky do system promptu (atribut `source` = dokument, `section_path`, strana → citace typu „(VPP M-100/23, čl. 29 odst. 8, strana 11)"). Metadata zdrojů (filename, page, section, zaokrouhlené `similarity`) jdou na klienta v hlavičce odpovědi `X-Sources` (URL-encoded JSON). Historie se ořezává na posledních 8 zpráv (`MAX_HISTORY`).

#### Moduly `src/lib/rag/`

| Soubor | Odpovědnost |
|---|---|
| `extract.ts` | PDF → text po stránkách přes `unpdf`; prostý text pro `.txt`/`.md` |
| `clean.ts` | Čištění mezi extrakcí a chunkováním: frekvenční odstranění opakovaných záhlaví/patiček stránek (normalizace čísel, práh 60 % stránek, min. 3 — bez hardcoded vzorů) + slepení řádků rozdělených sazbou PDF (interpunkce, zkratky, spojovníky). Čistí po stránkách, mapování na strany zůstává. Exportuje strukturní vzory řádků `STRUCT` a `isStructuralStart` (sdílí s parserem v `chunk.ts`) |
| `chunk.ts` | Strukturní chunkování: parser hierarchie (část → článek → `▶` odstavec, krátké podnadpisy; písmena výčtů `a)` hranici netvoří; řádky přehledu článků se demotují na obsah) + greedy skladač celých sekcí do chunků cílové velikosti dle runtime parametru (default 3 500 znaků, strop 1,3×, bez překryvu) s volitelnou breadcrumb hlavičkou `[docTitle › část › článek › odst.]`, která se embeduje s textem (`ChunkOptions`). `ChunkInput` nese `section_path`. Nestrukturované dokumenty (< 30 % obsahu v sekcích) → dělení po odstavcích |
| `embed.ts` | Embeddingy přes Voyage AI (`voyage-3.5`): `embedQuery` pro jeden dotaz, `embedBatch` pro indexaci. 429 kvůli chybějící platební metodě (limit free tieru) neopakuje a mapuje na srozumitelnou hlášku do `error_message` |
| `retrieve.ts` | `embedQuery` → volá Postgres RPC `match_chunks` (viz `002_match_chunks.sql`, rozšířeno v `007`) → vrátí chunky se skóre `similarity`, `filename` a `section_path` |
| `prompts.ts` | `SYSTEM_PROMPT`, `FALLBACK_MESSAGE`, `buildContextBlock` (sestaví `<document>` bloky pro kontext) |
| `pipeline.ts` | **Indexace** dokumentu (`processDocument`) — viz výše |

**Práh podobnosti se uplatňuje v SQL**, ne v JS: funkce `match_chunks` vrací jen chunky z dokumentů ve stavu `ready` se `similarity > match_threshold`. Když nic neprojde, `retrieve` vrátí prázdné pole.

**Fallback:** pokud `retrieve` vrátí 0 chunků, route přesto volá Claude, ale s instrukcí vypsat doslovně `FALLBACK_MESSAGE` („nenacházím odpověď, kontaktujte infolinku 800 123 456") a s prázdným `X-Sources`.

**Systémový prompt** (`prompts.ts`): bot odpovídá výhradně z poskytnutých chunků, česky, v každé odpovědi cituje zdrojový dokument, neposkytuje poradenství nad rámec citovaných podmínek a nesjednává produkty.

## Datový model

```sql
documents (id uuid PK, filename text, mime_type text, status text,
           error_message text NULL, chunk_count int, created_at timestamptz,
           chunking_config jsonb NULL)
-- chunking_config = otisk parametrů chunkování z poslední indexace
-- ({target_size, breadcrumb, strip_headers}); NULL = zastaralé (před fází 13)

chunks (id uuid PK, document_id uuid FK→documents ON DELETE CASCADE,
        chunk_index int, page int NULL, section_path text NULL,
        content text, embedding vector(1024))
-- HNSW index nad chunks.embedding; section_path = cesta sekce v hierarchii dokumentu
-- (např. „Část 2 – … › Článek 29 Pojistné plnění"), NULL u nestrukturovaných dokumentů

app_settings (id smallint PK CHECK (id = 1), top_k int, similarity_threshold double precision,
              llm_temperature double precision,
              telemetry_enabled boolean DEFAULT true, record_content boolean DEFAULT false,
              chunk_target_size int DEFAULT 3500, chunk_breadcrumb boolean DEFAULT true,
              chunk_strip_headers boolean DEFAULT true,
              updated_at timestamptz)
-- jednořádková konfigurace (id = 1) s runtime parametry RAG + přepínači telemetrie (Fáze 11)
-- + parametry chunkování (Fáze 13); CHECK rozsahy musí odpovídat min/max v src/lib/settings-meta.ts

feedback (id uuid PK, session_id text, message_index int, rating text CHECK ('up'/'down'),
          query text NULL, created_at timestamptz)
-- UNIQUE (session_id, message_index) — jeden hlas na zprávu v rámci session
```

Hodnoty `status` dokumentu: `uploaded → processing → ready | error`

## Admin autentizace

`/admin` je chráněno middlewarem (`src/middleware.ts`), který kontroluje session cookie nastavenou na `/admin/login`. Přihlášení vyžaduje uživatelské jméno (`ADMIN_USERNAME`, povinné) a heslo (`ADMIN_PASSWORD`). Auth API routy jsou v `/api/auth/login` a `/api/auth/logout`. Jde o autentizaci na úrovni prototypu — ne JWT, ne SSO.

## Runtime parametry RAG (`/admin/parameters`)

Parametry laditelné za běhu bez redeploye. **Pozor na zásadní rozdíl:** parametry retrievalu/generování působí **při dotazu** (změna okamžitá), parametry chunkování působí **při indexaci** (změna se projeví až reindexací dokumentů — UI to komunikuje žlutým upozorněním s odkazem na Dokumenty).

| Parametr | Rozsah | Kde se uplatní |
|---|---|---|
| `top_k` | 1–20 | počet chunků z retrievalu (při dotazu) |
| `similarity_threshold` | 0–1 | práh podobnosti v `match_chunks` (při dotazu) |
| `llm_temperature` | 0–1 | teplota Claude (hlavní větev chatu; fallback větev má vždy 0) |
| `chunk_target_size` | 1500–6000 | cílová velikost chunku ve znacích (při indexaci) |
| `chunk_breadcrumb` | bool | breadcrumb hlavička na začátku chunku (při indexaci) |
| `chunk_strip_headers` | bool | odstraňování záhlaví/patiček stránek (při indexaci) |

- **Úložiště:** jednořádková tabulka `app_settings` (id = 1), migrace `003_app_settings.sql` (+ `006`, `008`).
- **Server:** `lib/settings.ts` — `getSettings()` (čte přes service-role klienta; fallback na env `config` / tovární defaulty při chybějící tabulce / chybě DB) a `saveSettings()` (validace + clamp + uložení).
- **Sdílená metadata:** `lib/settings-meta.ts` (`SETTINGS_FIELDS`, `TELEMETRY_FIELDS`, `CHUNKING_SLIDER_FIELDS`/`CHUNKING_TOGGLE_FIELDS`, agregáty `ALL_NUMERIC_FIELDS`/`ALL_TOGGLE_FIELDS`, `clampField`, `parseSettingsInput`, `chunkingConfigOf`/`isChunkingStale`) — bez server importů, sdílí klient, API i server. Rozsahy jsou jediný zdroj pravdy; CHECK v migracích je druhá obranná linie.
- **Napojení (při dotazu):** `chat/route.ts` i `retrieval-test/route.ts` volají `getSettings()` při každém requestu (záměrně bez cache → změny se projeví okamžitě) a předávají hodnoty do `retrieve()` / `streamText`.
- **Napojení (při indexaci, Fáze 13):** `pipeline.ts` (`processDocument`) volá `getSettings()` a předává `chunkStripHeaders` do `cleanPages()` a `chunkTargetSize`/`chunkBreadcrumb` do `chunkText()`; po úspěchu ukládá otisk `chunkingConfigOf(settings)` do `documents.chunking_config`.
- **Reindexace:** `POST /api/documents/[id]/reprocess` znovu spustí `processDocument` nad originálem ve Storage (409 při běžícím zpracování; `after()` + `maxDuration = 60`). Tabulka dokumentů porovnává `chunking_config` s aktuálním nastavením (`isChunkingStale`; `NULL` = zastaralé) a zobrazuje žlutou indikaci + tlačítko Reindexovat (ikona RefreshCw) u `ready`/`error` dokumentů.
- **UI:** `/admin/parameters` (server `page.tsx` + klient `client.tsx`) — tři skupiny (slidery RAG · Telemetrie · Chunkování), karty `SliderCard`/`ToggleCard`, tlačítka **Uložit** a **Obnovit výchozí**.
- **Pozor:** `POST /api/settings` i `POST /api/documents/[id]/reprocess` (jako ostatní `/api/*`) nejsou chráněny middlewarem — známé omezení prototypu (viz produkční dluh v plánu).

## Observabilita (Langfuse)

RAG pipeline je trasována přes OpenTelemetry s exportem do Langfuse Cloud. Podrobný plán a gotchas viz [`docs/LANGFUSE_PLAN.md`](docs/LANGFUSE_PLAN.md).

- **`src/instrumentation.ts`** — Next.js hook `register()`: jednou při startu (Node.js runtime) zaregistruje `NodeTracerProvider` se sdíleným `LangfuseSpanProcessor`. Guard přes `globalThis` proti dvojí registraci (HMR). Bez Langfuse klíčů se neregistruje nic (warning + app běží dál).
- **`src/lib/telemetry.ts`** — jediný zdroj pravdy pro OTel: singleton `langfuseSpanProcessor` (drží se zde, aby na něj dosáhl i flush), `getTracer()`, `withSpan(name, fn, attrs)` (přes **`startActiveSpan`** — nutné pro vnořování spanů a zařazení AI SDK LLM spanu) a `flushTelemetry()` (`forceFlush` pro `after()` callbacky). Bez klíčů jsou všechny helpery no-op.
- **Span filtr:** `shouldExportSpan` propustí vše kromě interního šumu `next.js` — výchozí smart-filtr Langfuse by zahodil naše vlastní `kecalo` spany (nemají `gen_ai.` atributy).
- **Serverless export:** na Vercelu (`process.env.VERCEL`) má `LangfuseSpanProcessor` `exportMode: "immediate"` — default `batched` ztrácel pozdní spany (`chat-pipeline` + LLM končí v `onFinish` po dostreamování, funkce zmrzne dřív, než se batch odešle). Lokálně/long-running zůstává `batched`. Pozn.: `LANGFUSE_*` musí být v **Project** env proměnných Vercelu (ne jen Shared) + redeploy.
- **Instrumentované cesty:** chat (`chat-pipeline` → `retrieval` → `embed.query`/`vector-search`; LLM span automaticky z AI SDK přes `experimental_telemetry`), indexace (`document.process` → download/extract/clean/chunk/embed-batch/insert-chunks), upload (`document.upload`), retrieval-test (`retrieval-test`).
- **Streaming:** v `chat/route.ts` se rodičovský span ukončí až v `onFinish`/`onError` streamu (ne při návratu Response), aby latence zahrnula generování a LLM span se nestal osiřelým.
- **Runtime přepínače (Fáze 11):** podsekce **Telemetrie** v `/admin/parameters` (sloupce `app_settings.telemetry_enabled`, `record_content`):
  - **Telemetrie zapnutá** — master vypínač. Promítá se do proměnného flagu v `telemetry.ts` (`setTelemetryExport`), který čte `shouldExportSpan`: spany se vždy vytvoří, ale při vypnutí se neexportují. Flag obnovuje `getSettings()` (per request) a `saveSettings()` (okamžitě). V chat route navíc gateuje `experimental_telemetry.isEnabled`.
  - **Zaznamenávat obsah promptů a odpovědí** — řídí `recordInputs`/`recordOutputs` v chat route (per request). Default vypnuto (soukromí); zapnout jen pro ladění. Závisí na master vypínači (`ToggleField.dependsOn`): když je telemetrie vypnutá, přepínač se v adminu jen zašedne a nejde měnit — hodnotu nemění (zobrazuje skutečnou uloženou hodnotu, jen je disabled). Při opětovném zapnutí telemetrie se `recordContent` načte čerstvě z DB (`GET /api/settings`), aby se zahodila případná neuložená lokální změna schovaná pod disabled.
- **Soukromí:** ve výchozím stavu do Langfuse nejde obsah dotazů ani dokumentů, jen metadata (tokeny, latence, topK/threshold/temperature, počty chunků). Obsah lze zapnout přepínačem výše.
- **Voyage náklady:** posíláme `embed.total_tokens`; pro přesnou kalkulaci nákladů je nutné v Langfuse dashboardu nadefinovat custom model `voyage-3.5`.

## Seed dokumenty

Reálné dokumenty Kooperativy jsou ve složce `docs/` a slouží jako obsah demo znalostní báze:
- `VPP M-100_23` — pojištění majetku a odpovědnosti občanů (18 s.)
- `VPP M-200_23` — pojištění bytových domů (19 s.)
- `IPID` — informační dokument o pojistném produktu (2 s., rychlá indexace)
- `Informace pro klienta` — předsmluvní informace (11 s.)
- `testovaci_otazky*.md` — sady testovacích otázek včetně záměrných otázek mimo bázi pro ověření fallbacku
