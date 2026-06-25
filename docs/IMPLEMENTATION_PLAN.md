# Implementační plán: Kecalo

## Resume

Tento dokument je prováděcí checklist pro stavbu Kecala podle PRD v1.0. Sleduj ho průběžně — zaškrtávej hotové položky a po každém milníku commitni do GitHubu. Kromě přípravné Fáze 0 (prerekvizity před kurzem) se projekt dělí na 7 fází odpovídajících harmonogramu kurzu (bloky 1–7 v PRD kap. 12); každá fáze má jasný výstup (milník), který otestuješ dříve, než přejdeš dál. Fáze 8 je doplňková — vznikla po kurzu nad rámec původního harmonogramu.

**Stack:** Next.js 16 + React 19 + TypeScript · Tailwind CSS v4 + shadcn/ui · Vercel AI SDK · Claude API (claude-sonnet-4-6) · Voyage AI (voyage-3.5) · Supabase (Postgres + pgvector + Storage)

**Design:** UI ve stylu Anthropic Console (světlý režim, krémové pozadí `#FAF9F5`, korálový akcent `#D85A30`, font Inter). Admin = přesně Console (sidebar), chat = odvozený brand „Pojišťovna Jistota". Úplné tokeny viz sekce „Vzhled a design" v `CLAUDE.md`.

**Repozitář:** github.com/xkraust/kecalo | **Deploy:** Vercel (auto z `main`)

---

## Fáze 0 — Prerekvizity (před kurzem, ~45 min)

### Účty

- [x] GitHub účet (mám)
- [x] Anthropic Console — `ANTHROPIC_API_KEY` vygenerován, kredit ověřen ve Workbench
- [x] Voyage AI — `VOYAGE_API_KEY` vygenerován (free tier)
- [x] Supabase — nový projekt (region EU), DB heslo poznamenáno; pgvector **nevytvářet ručně** (vznikne migrací)
- [x] Vercel — přihlášen přes GitHub (propojení s repem proběhne ve fázi 1)

### Lokální nástroje

- [x] Node.js LTS 20+ (`node -v`) — v24.14.1
- [x] Git (`git --version`) — 2.53.0
- [x] Claude Code (`claude --version`, přihlášen) — 2.1.177
- [x] Supabase CLI (`supabase --version`) — 2.106.0

### Smoke test konektivity

- [x] Claude API odpovídá (curl / Workbench)
- [x] Voyage API odpovídá — embedding 1024 dimenzí ✓
- [x] Supabase DB dostupná přes `DATABASE_URL`

### Seed data (reálné dokumenty Kooperativy, již ve složce `docs/`)

Znalostní bázi tvoří reálná sada dokumentů Kooperativy k pojištění majetku, odpovědnosti a bytových domů:

- [x] `docs/VPP M-100_23 pro pojištění majetku a odpovědnosti občanů.pdf` — Všeobecné pojistné podmínky (hlavní zdroj pravidel, výluk a limitů)
- [x] `docs/VPP M-200_23 pro pojištění bytových domů.pdf` — Všeobecné pojistné podmínky pro bytové domy
- [x] `docs/Informační dokument o pojistném produktu (IPID).pdf` — strukturovaný přehled produktu „Pojištění bytového domu" (2 strany)
- [x] `docs/Informace pro klienta.pdf` — předsmluvní informace + zpracování osobních údajů (11 stran)
- [x] `docs/testovaci_otazky.md` — 12 otázek (10 v bázi s citacemi konkrétních článků, 2 záměrně mimo → test fallbacku), vychází z reálných podmínek Kooperativy

---

## Fáze 1 — Projekt, infrastruktura, první push (0:00–0:45)

**Milník:** aplikace běží lokálně na `localhost:3000`, první commit je na GitHubu, Vercel nasadil preview.

### Scaffold projektu

- [x] `create-next-app` (Next.js 16 + React 19 + Tailwind v4, `src/`, App Router) — scaffold do `scaffold-tmp` a přesun do kořene repa
- [x] Doinstalovat shadcn/ui: `npx shadcn@latest init -d` (base-ui, ne radix)
- [x] Přidat komponenty: `button input textarea card badge dialog table` (v `src/components/ui/`)
- [x] Nainstalovat závislosti: `ai @ai-sdk/anthropic @supabase/supabase-js voyageai unpdf react-markdown`
- [x] Design téma: Console paleta v `globals.css` (`:root`, světlý režim only), font `Inter` (subset `latin-ext`) v `layout.tsx`, ověřeno screenshotem

### Konfigurace prostředí

- [x] Vytvořit `.env.local` se všemi klíči (viz tabulka v PRD kap. 18.2)
- [x] Commitnout `.env.example` (prázdné hodnoty) — `.env.local` je v `.gitignore`
- [x] Ověřit, že `.gitignore` obsahuje `.env*` (kromě `.example`)

### Supabase migrace — init

- [x] `supabase init` v kořeni projektu
- [x] Vytvořit migraci `supabase/migrations/001_init.sql`:
  - rozšíření `pgvector` (`CREATE EXTENSION IF NOT EXISTS vector`)
  - tabulka `documents` (id, filename, mime_type, status, error_message, chunk_count, created_at)
  - tabulka `chunks` (id, document_id FK→documents CASCADE, chunk_index, page, content, embedding vector(1024))
  - HNSW index nad `chunks.embedding`
- [x] `supabase db push` → ověřeno přes REST API (documents ✓, chunks ✓)

### Vercel propojení

- [x] Vercel → Import Git Repository → `xkraust/kecalo`
- [x] Nastavit env proměnné ve Vercel projektu (import z `.env.local`)
- [x] Push do `main` → automatický deploy ověřen (placeholder stránka s Console tématem)

---

## Fáze 2 — Admin: upload a extrakce PDF (0:45–2:00)

**Milník:** Nahraný PDF se zobrazí v tabulce dokumentů se stavem `ready`.

> **Design:** admin přesně ve stylu Console — levý sidebar (`src/app/admin/layout.tsx`), white karty, status badge dle palety. Viz „Vzhled a design" v `CLAUDE.md` a mockup z plánovací session.
>
> **Struktura rout:** `/admin` = dashboard (úvodní strana), `/admin/documents` = upload + tabulka, `/admin/retrieval-test` = test retrievalu. Sidebar: Přehled · Dokumenty · Test retrievalu · Chat · Odhlásit.

### Auth admin sekce

- [x] Middleware `src/middleware.ts` — ochrana `/admin` rout pomocí HMAC session cookie (`src/lib/auth.ts`)
- [x] Stránka `/admin/login` — formulář s heslem, bez sidebaru
- [x] Redirect po přihlášení na `/admin` (dashboard)
- [x] Sidebar layout `src/app/admin/(authenticated)/layout.tsx` + `AdminSidebar.tsx` — navigace s aktivní položkou
- [x] Odhlášení — POST `/api/admin/logout`, smaže cookie, redirect na login

### Dashboard (`/admin`, úvodní strana)

- [x] `src/app/admin/(authenticated)/page.tsx` — Server Component (`force-dynamic`), agregace přes Supabase
- [x] Metrické karty (`StatCard`): Dokumenty, Chunky, Zaindexované strany, Připraveno (X/N)
- [x] Graf „Chunky podle dokumentu" (`ChunksByDocChart`, CSS bary) — řazení sestupně
- [x] „Stavy dokumentů" — rozpad `GROUP BY status` s `StatusBadge`
- [x] Pozn.: metriky využití (dotazy, míra fallbacku, prům. skóre, latence) = úroveň 2, odložené na fázi 7 / produkční dluh

### Upload UI (`/admin/documents`)

- [x] Komponenta `UploadZone` — drag & drop + file picker
- [x] Validace: povolené typy `application/pdf`, `text/plain`, `text/markdown` + kontrola přípony; max 20 MB
- [x] Chybová hláška při špatném typu nebo velikosti
- [x] Progress indikátor během uploadu (spinner)

### API route `POST /api/documents`

- [x] Přijmout `multipart/form-data`
- [x] Uložit originál do Supabase Storage (bucket `documents`, programatická tvorba)
- [x] Zapsat záznam do `documents` se stavem `uploaded`
- [x] Indexaci zatím nespouštět (Fáze 3)
- [x] Vrátit `document_id`

### Tabulka dokumentů

- [x] API route `GET /api/documents` — vrátí seznam (název, datum, chunk_count, status)
- [x] Komponenta `DocumentsTable` — polling stavu každé 3 s dokud není `ready`/`error`
- [x] Badge pro stavy: `uploaded` · `processing` · `ready` · `error` (`StatusBadge`)

---

## Fáze 3 — Chunking, embeddingy, pgvector (2:00–3:15)

**Milník:** Po nahrání PDF vrátí test retrievalu relevantní chunky se skóre.

### PDF extrakce (`lib/rag/extract.ts`)

- [x] Použít `unpdf` — extrahovat text po stránkách (kvůli citacím)
- [x] Pro `.txt`/`.md` přečíst přímo (`TextDecoder`)
- [x] Ošetřit chybu nečitelného PDF → stav `error` s důvodem

### Chunking (`lib/rag/chunk.ts`)

- [x] Splitter: ~900 tokenů (~3600 znaků), overlap ~150 tokenů (~600 znaků)
- [x] Metadata ke každému chunku: `document_id`, `page`, `chunk_index`
- [x] Exportovaná funkce `chunkText(pages, documentId): ChunkInput[]`

### Embeddingy (`lib/rag/embed.ts`)

- [x] Voyage AI klient s `VOYAGE_API_KEY`, model `voyage-3.5`, dimenze 1024
- [x] `embedBatch(texts)` — batchování po 128, `inputType: "document"`
- [x] `embedQuery(text)` — `inputType: "query"` pro retrieval
- [x] Fallback: chyba propagovaná do pipeline → stav `error`

### Processing pipeline (`lib/rag/pipeline.ts`)

- [x] `processDocument(documentId)` — extract → chunk → embed → uložit → `ready`
- [x] Error handling: try/catch → `documents.status = 'error'`, `error_message`
- [x] Napojení na upload: `after(processDocument(doc.id))` v POST `/api/documents` (Next.js 16)
- [x] Storage path sanitizace (bez diakritiky v klíči)

### Uložení do Supabase

- [x] Zápis chunků + embeddingů do `chunks` (dávky po 100, embedding jako JSON string)
- [x] Aktualizace `documents.status = 'ready'` a `chunk_count`
- [x] Smazání starých chunků před re-processingem

### Retrieval (`lib/rag/retrieve.ts`)

- [x] SQL migrace `002_match_chunks.sql` — RPC funkce pro cosine similarity v pgvector
- [x] `retrieve(query, topK, threshold)` — embedding dotazu → `match_chunks` RPC → top-k výsledků
- [x] Konfigurovatelný `topK` a `SIMILARITY_THRESHOLD` z env

### E2E ověření

- [x] Upload IPID.pdf (2 strany) → `processing` → `ready`, `chunk_count = 2`
- [x] Dashboard zobrazuje aktualizované metriky

---

## Fáze 4 — Chat API: RAG pipeline (3:15–4:30)

**Milník:** `curl POST /api/chat` vrátí streamovanou odpověď s citací zdroje.

### API route `POST /api/chat` (`src/app/api/chat/route.ts`)

- [x] Přijmout `{ messages }` (Vercel AI SDK v6 formát)
- [x] Query rewriting: odloženo na fázi 6 (ladění) — zatím se bere poslední user message
- [x] Spustit `retrieve(lastUserMessage)` — top-k chunků
- [x] Pokud retrieve vrátí prázdné pole → streamovat fallback hlášku, `X-Sources: []`
- [x] Sestavit prompt: systémový prompt (PRD §11, `src/lib/rag/prompts.ts`) + `<context>` blok + posledních 8 zpráv
- [x] Zavolat Claude API (`claude-sonnet-4-6`, teplota z config, maxOutputTokens 1500) přes `streamText` + `anthropic()` provider
- [x] Metadata zdrojů v HTTP headeru `X-Sources` (JSON) — klient je parsuje při streamu

### Konfigurace (`lib/config.ts`)

- [x] Již existuje z Fáze 2: `anthropicApiKey`, `topK`, `similarityThreshold`, `llmTemperature` — žádná změna nebyla potřeba

---

## Fáze 5 — Chat UI (4:30–5:30)

**Milník:** Kompletní end-to-end demo — otázka v UI → streamovaná odpověď → citace zdroje.

> **Design:** chat používá stejnou paletu a typografii jako admin (Console styl), ale s vlastním brandem „Pojišťovna Jistota" v hlavičce. Korál pro akční prvky (odeslat, ukázkové chipy, „Nová konverzace"). Viz „Vzhled a design" v `CLAUDE.md`.

### Layout a komponenty

- [x] Stránka `/` — chat interface (hlavička, vlákno, vstup, patička)
- [x] Hlavička: logo + „Pojišťovna Jistota" + tlačítko „Nová konverzace"
- [x] Patička: disclaimer text (statický)

### Chat vlákno

- [x] Custom streaming fetch (vlastní implementace místo `useChat` — AI SDK v6 změnilo API, přímý fetch je spolehlivější pro prototyp)
- [x] Komponenta `MessageBubble` — uživatel vpravo (korálový), bot vlevo (bílý s borderem)
- [x] Markdown rendering přes `react-markdown` v odpovědích bota
- [x] Loading indikátor (animované tečky) během streamu
- [x] Input disabled během generování

### Zdroje

- [x] Parsování `X-Sources` HTTP headeru z response
- [x] Komponenta `SourcesBlock` — rozklikávací `<details>` pod odpovědí: ikona + název + strana + skóre

### Ukázkové otázky (US-06)

- [x] 4 klikatelné chipy na úvodní obrazovce (pojištění majetku, výluky, spoluúčast, nahlášení události)
- [x] Klik odešle otázku přímo

### Nová konverzace (US-05)

- [x] Tlačítko „Nová konverzace" (ikona RotateCcw) — vymaže messages state, viditelné jen při existujících zprávách

---

## Fáze 6 — Smazání, ošetření chyb, ladění (5:30–6:30)

**Milník:** MVP kompletní — všechny M user stories fungují, chyby nezruší aplikaci.

### Smazání dokumentu (US-13)

- [x] API route `DELETE /api/documents/[id]` — smaže soubor ze Storage, záznam z `documents` (chunky přes CASCADE)
- [x] Potvrzovací dialog (shadcn `Dialog`) před smazáním — „Opravdu smazat? Nevratná akce."
- [x] Po smazání refresh tabulky + dashboard metriky klesnou

### Ošetření chyb (US-22)

- [x] Výpadek Claude/Voyage API → Chat API vrací 503, klient zobrazí „Služba dočasně nedostupná"
- [x] `onError` callback na `streamText` pro logování
- [x] Nečitelné PDF → stav `error` v tabulce s `error_message` (červený text pod názvem)
- [x] Upload špatného formátu / velký soubor → inline chybová hláška (UploadZone, již z Fáze 2)

### Ladění RAG

- [ ] Otestovat na seed dokumentech všech ~10 testovacích otázek (viz `docs/testovaci_otazky*.md`) — po nahrání seed dokumentů přes admin UI
- [ ] Doladit `SIMILARITY_THRESHOLD` a `TOP_K` pokud retrieval vrací irelevantní výsledky
- [ ] Ověřit systémový prompt — bot nesmí odpovídat mimo kontext
- [x] Retry logika pro Voyage AI 429 v `embed.ts` (exponenciální backoff, 3 pokusy)

---

## Fáze 7 — Bonusy a deploy (6:30–7:00)

**Milník:** Veřejné demo na Vercel URL.

### (S) Test retrievalu v adminu (US-14)

- [x] Panel v `/admin/retrieval-test` — pole pro dotaz, výpis top-k chunků: text (zkrácený ~300 znaků), zdroj, similarity skóre
- [x] API route `POST /api/retrieval-test`
- [x] Sidebar položka „Test retrievalu" aktivována

### Deploy na Vercel

- [x] Env proměnné nastaveny ve Vercel projektu (z Fáze 1)
- [x] Push do `main` → auto-deploy
- [ ] Smoke test na produkční URL: nahrání dokumentu, dotaz, fallback, smazání (odloženo — vyžaduje nahrané seed dokumenty)

### Závěrečný commit

- [x] `README.md` — projektové README s 5 kroky spuštění, seznamem env proměnných a stackem
- [x] Commitnout a pushovat

---

## Fáze 8 — Admin: globální parametry RAG (po kurzu)

**Milník:** V `/admin/parameters` lze slidery nastavit `TOP_K`, `SIMILARITY_THRESHOLD` a `LLM_TEMPERATURE`; uložené hodnoty se okamžitě projeví v chatu i v testu retrievalu. Env proměnné slouží jako výchozí hodnoty / fallback.

> **Pozn.:** Jde nad rámec kurzových fází 0–7. DB změny jen přes migrace. Slider stavím na Base UI (`@base-ui/react/slider`) ve stylu stávajících `ui/` primitiv. Middleware chrání jen stránky `/admin/*`, ne `/api/*` — nová `/api/settings` zůstává konzistentní s ostatními API routami (známé omezení prototypu, viz Produkční dluh).

### Úložiště — migrace `supabase/migrations/003_app_settings.sql`

- [x] Jednořádková tabulka `app_settings` (`id smallint PK default 1 check (id = 1)`) se sloupci `top_k`, `similarity_threshold`, `llm_temperature`, `updated_at` + CHECK rozsahy (musí odpovídat `min`/`max` v `settings-meta.ts` — to je jediný zdroj pravdy o rozsazích, CHECK je jen druhá obranná linie na úrovni DB; změna rozsahu vyžaduje novou migraci)
- [x] Seed výchozího řádku (`insert ... values (1) on conflict (id) do nothing`) s defaulty 5 / 0.35 / 0.2
- [x] `supabase db push` (vyžaduje `DATABASE_URL`) — migrace `003` aplikována na Supabase
- **Dílčí milník:** řádek `app_settings (id = 1)` existuje s výchozími hodnotami

### Sdílená metadata + validace — `src/lib/settings-meta.ts` (bez server importů)

- [x] `SETTINGS_FIELDS` — pro každý parametr `{ key, column, label, description, min, max, step, default, format }`
- [x] Rozsahy: `topK` 1–20 (krok 1), `similarityThreshold` 0–1 (krok 0,01, zobrazení v %), `llmTemperature` 0–1 (krok 0,05)
- [x] Helpery `clampField()` / `parseSettingsInput()` — sdílí klient (render), API (validace) i server

### Server přístup — `src/lib/settings.ts` (server-only)

- [x] `getSettings()` — čte `app_settings` (id = 1) přes service-role klienta; fallback na `config` defaulty při chybě / chybějící tabulce (try/catch)
- [x] `saveSettings(input)` — validace/clamp přes `settings-meta`, `update ... where id = 1` + `updated_at = now()`, vrací uložené hodnoty

### API route `POST /api/settings`

- [x] `src/app/api/settings/route.ts` — `saveSettings()` → 200 s uloženými hodnotami; 400 nevalidní vstup; 500 chyba DB (styl jako retrieval-test route)

### Napojení runtime (aby se nastavení projevilo)

> **Pozn.:** `getSettings()` se volá při každém requestu (jeden DB roundtrip navíc) — vědomý kompromis. Záměrně bez cache, aby se změna parametrů projevila okamžitě; cachování by šlo proti tomuto požadavku.

- [x] `chat/route.ts` — `getSettings()` → `retrieve(query, s.topK, s.similarityThreshold)`; hlavní větev `temperature: s.llmTemperature` (fallback větev nechat `temperature: 0`)
- [x] `retrieval-test/route.ts` — `getSettings()` → `retrieve(body.query, s.topK, s.similarityThreshold)`
- [x] `retrieve()` signaturu neměnit (overridy už podporuje)
- **Dílčí milník:** změna hodnot v DB mění chování chatu i testu retrievalu bez restartu serveru

### UI slider — `src/components/ui/slider.tsx`

- [x] Wrapper nad `@base-ui/react/slider` ve stylu `ui/dialog.tsx`: `Slider.Root → Control → Track → Indicator → Thumb`, `data-slot`, `cn()`, tokeny `secondary` (podklad) / `primary` (výplň) / `ring` (thumb). Pozn.: hodnota se zobrazuje z React stavu přes `format` (ne `Slider.Value`) — plná kontrola layoutu (min vlevo / hodnota / max vpravo)

### Stránka — `src/app/admin/(authenticated)/parameters/`

- [x] `page.tsx` (server, `force-dynamic`) — `getSettings()` → `<ParametersClient initial={...} />`, hlavička „Parametry" + podtitul (styl ostatních stránek)
- [x] `client.tsx` (`"use client"`) — pro každý parametr karta (`rounded-lg border`): nadpis + popis, slider s popiskem **min vlevo / max vpravo** a aktuální hodnotou, tlačítka **„Uložit"** a **„Obnovit výchozí"**
- [x] `POST /api/settings`, feedback „Uloženo / chyba" (styl retrieval-test / documents), po uložení sync stavu s vrácenými (clampnutými) hodnotami
- **Dílčí milník:** posun slideru → Uložit → po reloadu hodnoty drží; „Obnovit výchozí" vrátí defaulty

### Navigace — `src/components/AdminSidebar.tsx`

- [x] Položka `{ label: "Parametry", href: "/admin/parameters", icon: SlidersHorizontal }` mezi „Test retrievalu" a „Chat"

### Dokumentace

- [x] `CLAUDE.md` — env tabulka (3 parametry = nyní výchozí hodnoty; runtime z `app_settings`, editovatelné v `/admin/parameters`), architektura (routa, `/api/settings`, `lib/settings.ts` + `settings-meta.ts`, migrace `003`), seznam admin sekcí, datový model (+ `app_settings`)
- [x] `docs/IMPLEMENTATION_PLAN.md` — „Přehled API rout" (+ `POST /api/settings`), adresářová struktura (nové soubory), seznam migrací (+ `003_app_settings.sql`)

### E2E ověření

- [x] `npm run lint` + `npm run build` (typy, import Base UI slideru) — bez chyb
- [x] `/admin/parameters` — slidery, „Obnovit výchozí" a validace ověřeny v preview (klik na track přepočítá hodnotu i badge). Po aplikaci migrace `003` potvrzena perzistence: `POST /api/settings` zapíše a vrátí hodnoty z DB (read-after-write)
- [ ] Test retrievalu — změna `TOP_K` / threshold mění počet a filtraci výsledků (čeká na migraci `003` + nahrané dokumenty)
- [ ] Chat — vysoká vs. nízká temperature znatelný rozdíl; vysoký threshold → snazší fallback (čeká na migraci `003` + nahrané dokumenty)

---

## Fáze 9 — Langfuse: observabilita RAG pipeline (po kurzu) ✅

Podrobný plán viz [`docs/LANGFUSE_PLAN.md`](LANGFUSE_PLAN.md).

**Stav:** implementováno (lint, build OK; chat ověřen v runtime — graceful fallback). Instrumentace přes OpenTelemetry + `@langfuse/otel`: `src/instrumentation.ts` (registrace provideru), `src/lib/telemetry.ts` (singleton span processoru + `withSpan`/`getTracer`/`flushTelemetry`). Trasovány jsou chat (`chat-pipeline` → `retrieval` → `embed.query`/`vector-search` + LLM span z AI SDK), indexace (`document.process`), upload a retrieval-test. App běží i bez Langfuse klíčů (no-op). Export traces do Langfuse Cloud vyžaduje restart serveru (načtení `instrumentation.ts`).

---

## Fáze 10 — Zpětná vazba uživatelů (po kurzu)

**Milník:** Pod každou odpovědí bota v chatu se zobrazí tlačítka 👍/👎; kliknutí uloží hodnocení do DB; admin dashboard zobrazuje souhrnné statistiky zpětné vazby.

> **Pozn.:** Jde o jednoduchou agregovanou zpětnou vazbu — neukládáme obsah zpráv ani konverzační historii (GDPR). Session ID z localStorage slouží pouze k deduplikaci hlasů.

### DB — migrace `supabase/migrations/005_feedback.sql`

- [x] Tabulka `feedback`:
  - `id uuid PK DEFAULT gen_random_uuid()`
  - `session_id text NOT NULL` — anonymní UUID z localStorage (deduplikace)
  - `message_index int NOT NULL` — pořadí zprávy v konverzaci (0-based)
  - `rating text NOT NULL CHECK (rating IN ('up', 'down'))`
  - `query text` — dotaz uživatele (volitelné, pro kontext při ladění)
  - `created_at timestamptz DEFAULT now()`
- [x] UNIQUE constraint `(session_id, message_index)` — jeden hlas na zprávu v rámci session
- [x] `ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;` (bez policy — service role bypass)
- [x] `supabase db push`
- **Dílčí milník:** tabulka `feedback` existuje v Supabase

### API — `POST /api/feedback` (`src/app/api/feedback/route.ts`)

- [x] Vstup JSON: `{ sessionId: string, messageIndex: number, rating: "up" | "down", query?: string }`
- [x] Validace: `sessionId` neprázdný, `messageIndex` >= 0, `rating` jen `"up"` nebo `"down"`
- [x] `supabase.from("feedback").upsert(...)` s `onConflict: "session_id,message_index"` — umožní změnu hlasu
- [x] Návratové kódy: 200 (uloženo), 400 (nevalidní vstup), 500 (DB chyba)

### Chat UI — `src/components/MessageBubble.tsx`

- [x] Nové props: `messageIndex?: number`, `feedbackRating?: "up" | "down" | null`, `onFeedback?: (messageIndex: number, rating: "up" | "down") => void`
- [x] Tlačítka se zobrazují jen pro `role === "assistant"` a jen když je zpráva neprázdná (hotově nastreamovaná)
- [x] Dva icon buttony (`ThumbsUp`, `ThumbsDown` z `lucide-react`, size 14) pod `SourcesBlock`
- [x] Styl: ghost / transparentní, barva `text-secondary` → po hoveru `text-primary`; vybraný hlas má korálový akcent (`text-coral`)
- [x] Po kliknutí: callback `onFeedback` → parent odešle `POST /api/feedback`

### Stav feedbacku — `src/app/page.tsx`

- [x] `sessionId` (UUID v4) — vygenerovat při prvním loadu a uložit do `localStorage` (klíč `kecalo_session_id`)
- [x] `feedbackMap: Record<number, "up" | "down">` — klientský stav, mapuje `messageIndex` na rating
- [x] `handleFeedback(messageIndex, rating)` — `POST /api/feedback`, aktualizuje `feedbackMap`
- [x] Předat `messageIndex`, `feedbackRating`, `onFeedback` do `MessageBubble`

### Admin dashboard — `src/app/admin/(authenticated)/page.tsx`

- [x] Nový dotaz: `supabase.from("feedback").select("rating")` → spočítat `up` / `down` / celkem
- [x] Nová `StatCard` v gridu: „Zpětná vazba" s hodnotou např. „👍 12 / 👎 3" nebo poměrem „80 % pozitivní"
- **Dílčí milník:** dashboard zobrazuje agregát feedbacku

### Dokumentace

- [x] `CLAUDE.md` — sekce architektura (nová API ruta, tabulka), adresářová struktura (nové soubory), datový model (`feedback`)
- [x] `docs/IMPLEMENTATION_PLAN.md` — zaškrtnutí kroků, „Přehled API rout" (+ `POST /api/feedback`), adresářová struktura (nové soubory), seznam migrací (+ `005_feedback.sql`)

### E2E ověření

- [x] `npm run lint` + `npm run build` — bez chyb
- [x] Chat — klik na 👍 → tlačítko se zvýrazní, opakovaný klik nemá efekt, klik na 👎 přepne hlas
- [ ] Admin dashboard — StatCard „Zpětná vazba" ukazuje správné počty
- [ ] DB — `select * from feedback` potvrzuje záznamy s upsert (změna hlasu = update, ne duplikát)

---

## Fáze 11 — Telemetrie: runtime přepínače observability (po kurzu)

**Milník:** Na stránce `/admin/parameters` přibude druhá podsekce **„Telemetrie"** se dvěma přepínači (master vypínač telemetrie + zaznamenávání obsahu promptů/odpovědí), napojená na stávající `app_settings`. Změny se projeví okamžitě bez restartu/redeploye.

> **Pozn.:** Dnes jsou `recordInputs`/`recordOutputs` v `chat/route.ts` natvrdo `false` (soukromí) — v Langfuse je `Input: null`. Tato fáze to zpřístupní jako runtime přepínač pro ladění RAG. Rozsah: #1 master vypínač + #2 obsah promptů (jeden společný přepínač pro vstupy i výstupy). Vzorkování dotazů odloženo.

### Klíčové designové rozhodnutí — master vypínač přes `shouldExportSpan`

Parametr #2 je per-request (čte se v chat route). Parametr #1 musí gateovat i hluboké vlastní spany (`retrieval`, `embed.query`, `vector-search`, `document.process`), které `getSettings()` nevolají. Místo threadování flagu přes každý `withSpan` se využije proměnný modul-level flag v `telemetry.ts`, který čte `shouldExportSpan`: spany se vytvoří (levné), ale při vypnuté telemetrii se **neexportují**. Flag se obnoví v `getSettings()` (per request) a okamžitě v `saveSettings()`. Žádný cyklus importů (`settings.ts → telemetry.ts`; telemetry.ts neimportuje settings.ts).

### DB — migrace `supabase/migrations/006_telemetry_settings.sql`

- [x] `ALTER TABLE app_settings ADD COLUMN telemetry_enabled boolean NOT NULL DEFAULT true, ADD COLUMN record_content boolean NOT NULL DEFAULT false;`
- [ ] `supabase db push` (čeká na uživatele — dokud neproběhne, `getSettings` selektuje neexistující sloupce a spadne na fallback, ukládání parametrů nejde)
- **Dílčí milník:** `app_settings` má nové sloupce

### Sdílená metadata — `src/lib/settings-meta.ts`

- [x] Rozšířit `SettingsValues` o `telemetryEnabled: boolean`, `recordContent: boolean`
- [x] Přidat `ToggleField` typ + `TELEMETRY_FIELDS` (paralelně k `SETTINGS_FIELDS`, beze změny stávajících sliderů); pole nese `label`, `description`, `default`, volitelný `warning`. Přidány typy `NumericSettingKey`/`ToggleSettingKey`.
- [x] `parseSettingsInput` — doplnit smyčku přes `TELEMETRY_FIELDS` s `parseBool` helperem
- [x] `DEFAULT_SETTINGS` — `telemetryEnabled: true`, `recordContent: false`

### Server — `src/lib/settings.ts`

- [x] `getSettings()` — select + mapování nových sloupců; po načtení `setTelemetryExport(telemetryEnabled)`
- [x] `saveSettings()` — uložit nové sloupce (z `TELEMETRY_FIELDS`); po uložení `setTelemetryExport(telemetryEnabled)`
- [x] `configFallback()` — doplnit oba booleany

### Telemetry runtime flag — `src/lib/telemetry.ts`

- [x] Modul-level `let exportEnabled = true` + `setTelemetryExport(enabled)`
- [x] `shouldExportSpan` rozšířit: `({ otelSpan }) => exportEnabled && otelSpan.instrumentationScope.name !== "next.js"`

### Chat route — `src/app/api/chat/route.ts`

- [x] V obou `experimental_telemetry`: `isEnabled: settings.telemetryEnabled`, `recordInputs/recordOutputs: settings.recordContent`

### UI — Switch komponenta + parametry

- [x] Nová `src/components/ui/switch.tsx` — stejný vzor jako `slider.tsx`, nad Base UI `@base-ui/react/switch` (Root + Thumb), korálový akcent `data-[checked]:bg-primary`
- [x] `parameters/client.tsx` — druhá skupina „Telemetrie" mapující `TELEMETRY_FIELDS` na karty s přepínačem (u `recordContent` žlutý varovný pruh); boolean update handler; `handleReset` využije rozšířený `DEFAULT_SETTINGS`
- [x] `parameters/page.tsx` — beze změny (`initial` z `getSettings` ponese nové klíče)

### Dokumentace

- [x] `CLAUDE.md` — sekce „Observabilita" + „Runtime parametry RAG", datový model `app_settings` (+ 2 sloupce), migrace `006`
- [x] `docs/IMPLEMENTATION_PLAN.md` — zaškrtnutí kroků, seznam migrací (+ `006`)

### E2E ověření

- [x] `npm run lint` + `npm run build` — bez chyb
- [x] Restart dev serveru (načtení `telemetry.ts`) — OTel provider zaregistrován, chat OK (getSettings na fallbacku bez migrace)
- [ ] #2 — zapnout „Zaznamenávat obsah" → Uložit → chat dotaz → v Langfuse `Input`/`Output` obsahují text (čeká na migraci)
- [ ] #1 — vypnout „Telemetrie zapnutá" → Uložit → chat dotaz → v Langfuse nepřibude trace; zapnout zpět → traces se obnoví (čeká na migraci)
- [ ] Persistence (reload drží stav z DB) a „Obnovit výchozí" (telemetrie zap., obsah vyp.) (čeká na migraci)

> **Omezení:** `document.process`/`document.upload` nevolají `getSettings()`, takže master flag tam má hodnotu z posledního chat/retrieval-test requestu nebo z posledního uložení (po `saveSettings()` okamžitě aktuální) — pro prototyp dostačující.

---

## Přehled API rout

| Metoda | Route | Účel |
|---|---|---|
| `POST` | `/api/chat` | RAG pipeline → stream odpovědi + metadata zdrojů |
| `POST` | `/api/documents` | Upload + spuštění indexace |
| `GET` | `/api/documents` | Seznam dokumentů + stav |
| `DELETE` | `/api/documents/:id` | Smazání dokumentu, chunků, souboru |
| `POST` | `/api/retrieval-test` | Top-k chunků pro dotaz (admin) |
| `POST` | `/api/settings` | Uložení globálních runtime parametrů RAG (admin) |
| `POST` | `/api/feedback` | Uložení zpětné vazby (thumbs up/down) |

## Adresářová struktura (aktuální stav)

```
kecalo/
├── src/
│   ├── middleware.ts                 # ochrana /admin (session cookie)
│   ├── app/
│   │   ├── page.tsx                  # Chat UI
│   │   ├── admin/
│   │   │   ├── login/page.tsx        # Admin login (mimo route group)
│   │   │   └── (authenticated)/     # route group chráněná middlewarem
│   │   │       ├── layout.tsx        # Sidebar layout (Console styl)
│   │   │       ├── page.tsx          # Admin dashboard
│   │   │       ├── documents/page.tsx    # server část
│   │   │       ├── documents/client.tsx  # klientská část (upload + tabulka)
│   │   │       ├── retrieval-test/page.tsx
│   │   │       ├── parameters/page.tsx    # server část (getSettings)
│   │   │       └── parameters/client.tsx  # klient (slidery + uložení)
│   │   └── api/
│   │       ├── chat/route.ts
│   │       ├── documents/route.ts
│   │       ├── documents/[id]/route.ts
│   │       ├── retrieval-test/route.ts
│   │       ├── settings/route.ts
│   │       ├── feedback/route.ts
│   │       └── auth/{login,logout}/route.ts
│   ├── components/
│   │   ├── MessageBubble.tsx
│   │   ├── SourcesBlock.tsx
│   │   ├── UploadZone.tsx
│   │   ├── DocumentsTable.tsx
│   │   ├── AdminSidebar.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── StatCard.tsx
│   │   ├── ChunksByDocChart.tsx
│   │   └── ui/                       # shadcn/ui primitiva
│   └── lib/
│       ├── config.ts
│       ├── supabase.ts
│       ├── auth.ts                   # podpis/ověření session cookie (HMAC)
│       ├── settings.ts               # server: getSettings/saveSettings
│       ├── settings-meta.ts          # sdílená metadata + validace parametrů
│       ├── types.ts
│       ├── utils.ts
│       └── rag/
│           ├── extract.ts
│           ├── chunk.ts
│           ├── embed.ts
│           ├── retrieve.ts
│           ├── prompts.ts            # systémový prompt, fallback, kontext blok
│           └── pipeline.ts           # indexace dokumentu (processDocument)
├── supabase/
│   └── migrations/
│       ├── 001_init.sql              # tabulky documents/chunks + HNSW index
│       ├── 002_match_chunks.sql      # RPC match_chunks (retrieval)
│       ├── 003_app_settings.sql      # app_settings (runtime parametry RAG)
│       ├── 005_feedback.sql          # feedback (zpětná vazba thumbs up/down)
│       └── 006_telemetry_settings.sql # app_settings += telemetry_enabled, record_content
├── .env.example
└── README.md
```

---

## Produkční dluh (po MVP)

- Autentizace a role (SSO, admin/editor)
- Samostatný `SESSION_SECRET` pro podpis session cookie (dnes se podepisuje heslem `ADMIN_PASSWORD` v `api/auth/login`), aby byl podpisový klíč oddělen od přihlašovacího tajemství a rotace hesla automaticky neměnila platnost session
- Rate limiting a ochrana proti prompt injection z dokumentů
- GDPR: retence konverzací, mazání dat
- RAG evaluace — golden dataset, evals pipeline
- Verzování dokumentů a platnost podmínek v čase
- Podpora DOCX / HTML / skenovaných PDF (OCR)
- Monitoring nákladů a latence — základ hotov ve Fázi 9 (Langfuse traces); zbývá custom Voyage model pro přesné náklady a dashboard metriky z Langfuse API
- Eskalace na živého operátora
- Dashboard — metriky využití (úroveň 2): logování dotazů → počet dotazů, míra fallbacku, prům. skóre podobnosti, latence; časové řady (zvážit `recharts`)
