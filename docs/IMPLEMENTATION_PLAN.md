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
- [ ] Doinstalovat shadcn/ui: `npx shadcn@latest init`
- [ ] Přidat komponenty: `npx shadcn@latest add button input textarea card badge dialog table`
- [ ] Nainstalovat závislosti: `npm i ai @ai-sdk/anthropic @supabase/supabase-js voyageai unpdf react-markdown`
- [ ] **Design téma:** v `src/app/globals.css` nastavit CSS proměnné dle palety Console (viz „Vzhled a design" v `CLAUDE.md`); načíst font `Inter` přes `next/font` v `layout.tsx`; ověřit krémové pozadí + korálový akcent

### Konfigurace prostředí

- [ ] Vytvořit `.env.local` se všemi klíči (viz tabulka v PRD kap. 18.2)
- [ ] Commitnout `.env.example` (prázdné hodnoty) — `.env.local` je v `.gitignore`
- [ ] Ověřit, že `.gitignore` obsahuje `.env*` (kromě `.example`)

### Supabase migrace — init

- [ ] `supabase init` v kořeni projektu
- [ ] Vytvořit migraci `supabase/migrations/001_init.sql`:
  - rozšíření `pgvector` (`CREATE EXTENSION IF NOT EXISTS vector`)
  - tabulka `documents` (id, filename, mime_type, status, error_message, chunk_count, created_at)
  - tabulka `chunks` (id, document_id FK→documents CASCADE, chunk_index, page, content, embedding vector(1024))
  - HNSW index nad `chunks.embedding`
- [ ] `supabase db push` → ověřit schéma v Supabase Table Editor

### Vercel propojení

- [ ] Vercel → Import Git Repository → `xkraust/kecalo`
- [ ] Nastavit env proměnné ve Vercel projektu (stejné jako `.env.local`)
- [ ] Push do `main` → ověřit automatický deploy

---

## Fáze 2 — Admin: upload a extrakce PDF (0:45–2:00)

**Milník:** Nahraný PDF se zobrazí v tabulce dokumentů se stavem `ready`.

> **Design:** admin přesně ve stylu Console — levý sidebar (`src/app/admin/layout.tsx`), white karty, status badge dle palety. Viz „Vzhled a design" v `CLAUDE.md` a mockup z plánovací session.
>
> **Struktura rout:** `/admin` = dashboard (úvodní strana), `/admin/documents` = upload + tabulka, `/admin/retrieval-test` = test retrievalu. Sidebar: Přehled · Dokumenty · Test retrievalu · Chat · Odhlásit.

### Auth admin sekce

- [ ] Middleware `src/middleware.ts` — ochrana `/admin` rout pomocí `ADMIN_PASSWORD` z env
- [ ] Stránka `/admin/login` — formulář s heslem, session cookie (simple, ne JWT)
- [ ] Redirect po přihlášení na `/admin` (dashboard)
- [ ] Sidebar layout `src/app/admin/layout.tsx` — navigace + aktivní položka (korálový podklad)

### Dashboard (`/admin`, úvodní strana)

- [ ] `src/app/admin/page.tsx` — Server Component, agregace přes Supabase service-role klient
- [ ] Metrické karty (`StatCard`): Dokumenty, Chunky (`SUM(chunk_count)`), Zaindexované strany (`COUNT(DISTINCT (document_id, page))`), Připraveno (X/N)
- [ ] Graf „Chunky podle dokumentu" (`ChunksByDocChart`, CSS bary) — řazení sestupně
- [ ] „Stavy dokumentů" — rozpad `GROUP BY status` s badge
- [ ] Pozn.: metriky využití (dotazy, míra fallbacku, prům. skóre, latence) = úroveň 2, odložené na fázi 7 / produkční dluh (vyžadují logování dotazů)

### Upload UI (`/admin/documents`)

- [ ] Komponenta `UploadZone` — drag & drop + file picker
- [ ] Validace: povolené typy `application/pdf`, `text/plain`, `text/markdown`; max 20 MB
- [ ] Chybová hláška při špatném typu nebo velikosti
- [ ] Progress indikátor během uploadu

### API route `POST /api/documents`

- [ ] Přijmout `multipart/form-data`
- [ ] Uložit originál do Supabase Storage (nebo lokálně do `/uploads`)
- [ ] Zapsat záznam do `documents` se stavem `uploaded`
- [ ] Spustit indexaci asynchronně (nebo synchronně s UI feedbackem — viz fáze 3)
- [ ] Vrátit `document_id`

### Tabulka dokumentů

- [ ] API route `GET /api/documents` — vrátí seznam (název, datum, chunk_count, status)
- [ ] Komponenta `DocumentsTable` — polling stavu každé 3 s dokud není `ready`/`error`
- [ ] Badge pro stavy: `uploaded` · `processing` · `ready` · `error`

---

## Fáze 3 — Chunking, embeddingy, pgvector (2:00–3:15)

**Milník:** Po nahrání PDF vrátí test retrievalu relevantní chunky se skóre.

### PDF extrakce (`lib/rag/extract.ts`)

- [ ] Použít `unpdf` — extrahovat text po stránkách (kvůli citacím)
- [ ] Pro `.txt`/`.md` přečíst přímo
- [ ] Ošetřit chybu nečitelného PDF → stav `error` s důvodem

### Chunking (`lib/rag/chunk.ts`)

- [ ] Splitter: ~900 tokenů (přibližně odhadnout z délky textu), overlap 150 tokenů
- [ ] Metadata ke každému chunku: `document_id`, `page`, `chunk_index`
- [ ] Exportovat funkci `chunkText(text: string, pageMap: PageMap): Chunk[]`

### Embeddingy (`lib/rag/embed.ts`)

- [ ] Inicializovat Voyage AI klienta s `VOYAGE_API_KEY`
- [ ] Funkce `embedBatch(texts: string[]): Promise<number[][]>` — model `voyage-3.5`, dimenze 1024
- [ ] Batchování po 128 textech (API limit)
- [ ] Fallback při výpadku: logovat chybu, přejít na stav `error`

### Uložení do Supabase

- [ ] Zapsat chunky včetně embeddingů do tabulky `chunks`
- [ ] Po dokončení aktualizovat `documents.status = 'ready'` a `chunk_count`

### Test retrievalu (`lib/rag/retrieve.ts`)

- [ ] Funkce `retrieve(query: string, topK = 5): Promise<Chunk[]>` — embedding dotazu → cosine similarity v pgvector → vrátit top-k chunků s `similarity` skóre
- [ ] Konfigurovatelný `topK` a `SIMILARITY_THRESHOLD` z env (default 0.35)

---

## Fáze 4 — Chat API: RAG pipeline (3:15–4:30)

**Milník:** `curl POST /api/chat` vrátí streamovanou odpověď s citací zdroje.

### API route `POST /api/chat` (`lib/rag/pipeline.ts`)

- [ ] Přijmout `{ messages: Message[] }` (Vercel AI SDK formát)
- [ ] (Volitelně) query rewriting: přeformulovat navazující dotaz na samostatný pomocí LLM nebo jednoduché konkatenace kontextu
- [ ] Spustit `retrieve(lastUserMessage)` — získat top-k chunků
- [ ] Pokud `bestScore < SIMILARITY_THRESHOLD` → streamovat fallback hlášku, přidat metadata `{ sources: [] }`
- [ ] Sestavit prompt:
  - systémový prompt (viz PRD kap. 11)
  - chunky jako `<context>` s označením zdroje
  - posledních 8 zpráv z historie
  - aktuální dotaz
- [ ] Zavolat Claude API (`claude-sonnet-4-6`, teplota 0.2, max_tokens 1500) se streamováním
- [ ] Do streamu přidat na konec metadata zdrojů (název dokumentu, strana, chunk_index, skóre)

### Konfigurace (`lib/config.ts`)

- [ ] Exportovat konstanty z env: `ANTHROPIC_API_KEY`, `TOP_K`, `SIMILARITY_THRESHOLD`, `MAX_CONTEXT_TOKENS`, `LLM_TEMPERATURE`
- [ ] Default hodnoty pokud env není nastavena

---

## Fáze 5 — Chat UI (4:30–5:30)

**Milník:** Kompletní end-to-end demo — otázka v UI → streamovaná odpověď → citace zdroje.

> **Design:** chat používá stejnou paletu a typografii jako admin (Console styl), ale s vlastním brandem „Pojišťovna Jistota" v hlavičce. Korál pro akční prvky (odeslat, ukázkové chipy, „Nová konverzace"). Viz „Vzhled a design" v `CLAUDE.md`.

### Layout a komponenty

- [ ] Stránka `/` — chat interface (hlavička, vlákno, vstup, patička)
- [ ] Hlavička: logo + název fiktivní pojišťovny „Pojišťovna Jistota" (pozn.: Kecalo = název projektu/repa, brand v UI je pojišťovna — sjednoceno se systémovým promptem v PRD kap. 11)
- [ ] Patička: disclaimer text (statický)

### Chat vlákno

- [ ] Hook `useChat` z Vercel AI SDK napojený na `POST /api/chat`
- [ ] Komponenta `MessageBubble` — uživatel vpravo, bot vlevo, čas
- [ ] Renderovat Markdown v odpovědích bota (knihovna `react-markdown`)
- [ ] Loading indikátor (tečky/spinner) během streamu
- [ ] Input disabled během generování

### Zdroje

- [ ] Parsovat metadata zdrojů z konce streamu
- [ ] Komponenta `SourcesBlock` — rozklikávací seznam pod odpovědí: název dokumentu, strana/chunk

### Ukázkové otázky (US-06)

- [ ] 3–4 klikatelné chipy na úvodní (prázdné) obrazovce — natvrdo v konfiguraci
- [ ] Klik odešle otázku jako by ji uživatel napsal

### Nová konverzace (US-05)

- [ ] Tlačítko „Nová konverzace" — vymaže `messages` state i kontext

---

## Fáze 6 — Smazání, ošetření chyb, ladění (5:30–6:30)

**Milník:** MVP kompletní — všechny M user stories fungují, chyby nezruší aplikaci.

### Smazání dokumentu (US-13)

- [ ] API route `DELETE /api/documents/:id` — smazat chunky (CASCADE), záznam v `documents`, soubor v Storage
- [ ] Potvrzovací dialog (`AlertDialog` ze shadcn) před smazáním
- [ ] Po smazání ověřit, že retrieval na obsah dokumentu nevrací žádné chunky

### Ošetření chyb (US-22)

- [ ] Výpadek Claude API → zobrazit „Omlouváme se, služba je dočasně nedostupná. Zkuste to za chvíli."
- [ ] Rate limit → stejná hláška s retry
- [ ] Nečitelné PDF → stav `error` v tabulce s popisem chyby
- [ ] Upload špatného formátu / velký soubor → inline chybová hláška

### Ladění RAG

- [ ] Otestovat na seed dokumentech všech ~10 testovacích otázek
- [ ] Doladit `SIMILARITY_THRESHOLD` a `TOP_K` pokud retrieval vrací irelevantní výsledky
- [ ] Ověřit systémový prompt — bot nesmí odpovídat mimo kontext

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
