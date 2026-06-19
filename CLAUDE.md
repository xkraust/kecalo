# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Pracovní postup

Po dokončení každého kroku v rámci libovolné fáze implementace (viz `docs/IMPLEMENTATION_PLAN.md`) aktualizuj tento soubor CLAUDE.md — doplň nebo oprav sekce, které daný krok ovlivnil. CLAUDE.md musí vždy odrážet aktuální stav projektu, stejně tak aktualizuj implementační plán (`docs/IMPLEMENTATION_PLAN.md`), zaškrtni všechny kroky, které jsou hotové. Pokud při implemntaci vznikne potřeba implementační plán doplnit či pozměnit, oznam tuto skutečnost uživateli, navrhni změnu a počkej na souhlas. Po dokončení každé fáze nebo vetšího kroku se zeptej, zda se má provést push a commit.

## Stav projektu

Fáze 0–5 hotovy. Fáze 6 hotova (kromě ladění RAG na seed dokumentech — odloženo na uživatele). Implementováno: DELETE endpoint + potvrzovací dialog, ošetření chyb (retrieval try/catch → 503, onError logging, error_message v tabulce, sjednocené hlášky), retry logika pro Voyage AI 429. Průběžný stav sleduj v `docs/IMPLEMENTATION_PLAN.md`.

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

- **Admin (`/admin`)** — přesně ve stylu Console: levý sidebar (Přehled · Dokumenty · Test retrievalu · Chat · Odhlásit), krémové pozadí, korálový akcent, čisté white karty. Úvodní strana `/admin` je dashboard s přehledem znalostní báze (metrické karty + grafy).
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

Všechny změny DB schématu jdou výhradně přes migrační soubory v `supabase/migrations/` — nikdy neprovádět ruční úpravy v SQL editoru Supabase.

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
| `ADMIN_PASSWORD` | Ochrana `/admin` rout |
| `TOP_K` | Počet výsledků z retrievalu (výchozí: 5) |
| `SIMILARITY_THRESHOLD` | Práh kosinové podobnosti (výchozí: 0.35) |
| `LLM_TEMPERATURE` | Teplota Claude (výchozí: 0.2) |

## Architektura

### Stránky a API routy

```
/                       → Chat UI (hook useChat, streamování, blok zdrojů, disclaimer)
/admin                  → Dashboard (přehled znalostní báze — metrické karty + grafy)
/admin/documents        → Upload + tabulka dokumentů
/admin/retrieval-test   → Panel test retrievalu
/admin/login            → Login heslem, nastaví session cookie

POST   /api/chat                → RAG pipeline → streamovaná odpověď + metadata zdrojů
POST   /api/documents           → upload → extrakce → chunking → embeddingy → uložení
GET    /api/documents           → seznam dokumentů se stavem
DELETE /api/documents/[id]      → smazání dokumentu, chunků (CASCADE), souboru v Storage
POST   /api/retrieval-test      → vrátí top-k chunků se skóre (pouze admin)
```

### Cílová adresářová struktura

```
src/
├── app/
│   ├── page.tsx                      # Chat UI
│   ├── admin/
│   │   ├── layout.tsx                # Sidebar layout (Console styl)
│   │   ├── page.tsx                  # Dashboard (přehled znalostní báze)
│   │   ├── documents/page.tsx        # Upload + tabulka dokumentů
│   │   ├── retrieval-test/page.tsx   # Panel test retrievalu
│   │   └── login/page.tsx
│   └── api/
│       ├── chat/route.ts
│       ├── documents/route.ts
│       ├── documents/[id]/route.ts
│       └── retrieval-test/route.ts
├── components/
│   ├── MessageBubble.tsx
│   ├── SourcesBlock.tsx
│   ├── UploadZone.tsx
│   ├── DocumentsTable.tsx
│   ├── StatCard.tsx                  # metrická karta dashboardu
│   └── ChunksByDocChart.tsx          # graf chunků (CSS bary)
└── lib/
    ├── config.ts                     # konstanty z env, default hodnoty
    ├── supabase.ts                   # Supabase client (service role)
    └── rag/
        ├── extract.ts
        ├── chunk.ts
        ├── embed.ts
        ├── retrieve.ts
        └── pipeline.ts
supabase/
└── migrations/
    └── 001_init.sql
```

### RAG pipeline (`src/lib/rag/`)

| Soubor | Odpovědnost |
|---|---|
| `extract.ts` | PDF → text po stránkách přes `unpdf`; prostý text pro `.txt`/`.md` |
| `chunk.ts` | Rozdělení na chunky ~900 tokenů s overlapem 150 tokenů; metadata `document_id`, `page`, `chunk_index` |
| `embed.ts` | Dávkové embeddingy přes Voyage AI (`voyage-3.5`), dávky po 128; při chybě nastaví stav dokumentu na `error` |
| `retrieve.ts` | Embedding dotazu → vyhledání kosinovou podobností v pgvector → vrátí top-k chunků se skóre `similarity` |
| `pipeline.ts` | (volitelně) query rewriting → retrieve → kontrola prahu → sestavení promptu → stream Claude → metadata zdrojů |

**Fallback:** pokud nejlepší skóre podobnosti < `SIMILARITY_THRESHOLD`, streamuje se pevně daná česká odpověď „nevím / kontaktujte infolinku" bez volání Claude.

**Systémový prompt** (PRD §11): bot odpovídá výhradně z poskytnutých chunků dokumentů, česky, v každé odpovědi cituje zdrojový dokument a nikdy si nic nevymýšlí.

## Datový model

```sql
documents (id uuid PK, filename text, mime_type text, status text,
           error_message text NULL, chunk_count int, created_at timestamptz)

chunks (id uuid PK, document_id uuid FK→documents ON DELETE CASCADE,
        chunk_index int, page int NULL, content text, embedding vector(1024))
-- HNSW index nad chunks.embedding
```

Hodnoty `status` dokumentu: `uploaded → processing → ready | error`

## Admin autentizace

`/admin` je chráněno middlewarem (`src/middleware.ts`), který kontroluje session cookie nastavenou na `/admin/login`. Heslo pochází z env proměnné `ADMIN_PASSWORD`. Jde o autentizaci na úrovni prototypu — ne JWT, ne SSO.

## Seed dokumenty

Reálné dokumenty Kooperativy jsou ve složce `docs/` a slouží jako obsah demo znalostní báze:
- `VPP M-100_23` — pojištění majetku a odpovědnosti občanů (18 s.)
- `VPP M-200_23` — pojištění bytových domů (19 s.)
- `IPID` — informační dokument o pojistném produktu (2 s., rychlá indexace)
- `Informace pro klienta` — předsmluvní informace (11 s.)
- `testovaci_otazky*.md` — sady testovacích otázek včetně záměrných otázek mimo bázi pro ověření fallbacku
