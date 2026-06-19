# Implementační plán: Kecalo

## Resume

Tento dokument je prováděcí checklist pro stavbu Kecala podle PRD v1.0. Sleduj ho průběžně — zaškrtávej hotové položky a po každém milníku commitni do GitHubu. Kromě přípravné Fáze 0 (prerekvizity před kurzem) se projekt dělí na 7 fází odpovídajících harmonogramu kurzu (bloky 1–7 v PRD kap. 12); každá fáze má jasný výstup (milník), který otestuješ dříve, než přejdeš dál.

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
- [ ] **Design téma:** v `src/app/globals.css` nastavit CSS proměnné dle palety Console (viz „Vzhled a design" v `CLAUDE.md`); načíst font `Inter` přes `next/font` v `layout.tsx`; ověřit krémové pozadí + korálový akcent

### Konfigurace prostředí

- [ ] Vytvořit `.env.local` se všemi klíči (viz tabulka v PRD kap. 18.2)
- [ ] Commitnout `.env.example` (prázdné hodnoty) — `.env.local` je v `.gitignore`
- [ ] Ověřit, že `.gitignore` obsahuje `.env*` (kromě `.example`)

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

- [ ] Panel v `/admin` — pole pro dotaz, výpis top-k chunků: text (zkrácený), zdroj, similarity skóre
- [ ] API route `POST /api/retrieval-test`

### Deploy na Vercel

- [ ] Ověřit, že všechny env proměnné jsou nastaveny ve Vercel projektu
- [ ] Push do `main` → zkontrolovat build log
- [ ] Smoke test na produkční URL: nahrání dokumentu, dotaz, fallback, smazání

### Závěrečný commit

- [ ] `README.md` — postup spuštění lokálně (5 kroků max), seznam env proměnných
- [ ] Commitnout a pushovat

---

## Přehled API rout

| Metoda | Route | Účel |
|---|---|---|
| `POST` | `/api/chat` | RAG pipeline → stream odpovědi + metadata zdrojů |
| `POST` | `/api/documents` | Upload + spuštění indexace |
| `GET` | `/api/documents` | Seznam dokumentů + stav |
| `DELETE` | `/api/documents/:id` | Smazání dokumentu, chunků, souboru |
| `POST` | `/api/retrieval-test` | Top-k chunků pro dotaz (admin) |

## Adresářová struktura (cíl)

```
kecalo/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Chat UI
│   │   ├── admin/
│   │   │   ├── page.tsx              # Admin dashboard
│   │   │   └── login/page.tsx        # Admin login
│   │   └── api/
│   │       ├── chat/route.ts
│   │       ├── documents/route.ts
│   │       ├── documents/[id]/route.ts
│   │       └── retrieval-test/route.ts
│   ├── components/
│   │   ├── MessageBubble.tsx
│   │   ├── SourcesBlock.tsx
│   │   ├── UploadZone.tsx
│   │   └── DocumentsTable.tsx
│   └── lib/
│       ├── config.ts
│       ├── supabase.ts
│       └── rag/
│           ├── extract.ts
│           ├── chunk.ts
│           ├── embed.ts
│           ├── retrieve.ts
│           └── pipeline.ts
├── supabase/
│   └── migrations/
│       └── 001_init.sql
├── .env.example
└── README.md
```

---

## Produkční dluh (po MVP)

- Autentizace a role (SSO, admin/editor)
- Rate limiting a ochrana proti prompt injection z dokumentů
- GDPR: retence konverzací, mazání dat
- RAG evaluace — golden dataset, evals pipeline
- Verzování dokumentů a platnost podmínek v čase
- Podpora DOCX / HTML / skenovaných PDF (OCR)
- Monitoring nákladů a latence
- Eskalace na živého operátora
- Dashboard — metriky využití (úroveň 2): logování dotazů → počet dotazů, míra fallbacku, prům. skóre podobnosti, latence; časové řady (zvážit `recharts`)
