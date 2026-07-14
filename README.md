# Kecalo

RAG chatbot pro pojišťovnu — prototyp jednodenního kurzu vibecodingu. V UI vystupuje jako „Pojišťovna Jistota", znalostní báze čerpá z reálných dokumentů Kooperativy ([docs/seed-docs/](docs/seed-docs/)).

Návštěvník klade otázky česky k pojistným produktům; bot odpovídá výhradně z indexovaných dokumentů a u každé odpovědi cituje zdroj (dokument, článek, strana). Na dotazy mimo znalostní bázi odpovídá řízeným fallbackem s odkazem na infolinku. U produktových dotazů nabídne kartu poptávky — kontakty se sbírají do admin sekce. Správa znalostní báze, poptávek, RAG parametrů i promptů probíhá za běhu v administraci, bez redeploye.

## Funkce

**Veřejný chat (`/`)**
- Streamovaná odpověď s blokem citovaných zdrojů (dokument, sekce, strana, skóre podobnosti)
- Fallback mimo znalostní bázi (statická odpověď, LLM se nevolá)
- Karta poptávky u produktových dotazů; shrnutí konverzace pro zpracovatele generuje Mistral
- Zpětná vazba palcem nahoru/dolů — palec dolů nabídne zanechání kontaktu

**Administrace (`/admin`, chráněná přihlášením)**
- Dashboard s přehledem znalostní báze (dokumenty, chunky, stavy)
- Upload a správa dokumentů (PDF/TXT/MD), reindexace bez re-uploadu při změně parametrů chunkování
- Poptávky — tabulka se stavy (nová → převzatá → uzavřená), typ produkt/hodnocení
- Test retrievalu — top-k chunků se skóre pro libovolný dotaz
- Runtime parametry RAG (top-k, práh podobnosti, teplota, chunkování) — změny bez redeploye
- Editace system promptu chatu a promptu shrnutí poptávek za běhu

**Provoz**
- Observabilita: OpenTelemetry tracing s exportem do Langfuse (volitelné; obsah dotazů se ve výchozím stavu neloguje)
- Evaluace: `npm run eval` prožene testovací otázky z Langfuse datasetů nasazenou aplikací a založí experiment s deterministickými skóre

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Vercel AI SDK · Claude API (`claude-sonnet-4-6`, chat) · Mistral (`mistral-small-latest`, shrnutí poptávek) · Voyage AI (`voyage-3.5`, embeddingy) · Supabase (Postgres + pgvector + Storage) · `unpdf` (parsování PDF) · Langfuse (observabilita)

## Spuštění lokálně

1. **Klonovat a nainstalovat:**
   ```bash
   git clone https://github.com/xkraust/kecalo.git
   cd kecalo
   npm install
   ```

2. **Nastavit env proměnné:** zkopírovat `.env.example` na `.env.local` a vyplnit hodnoty (viz tabulka níže).

3. **Aplikovat DB migrace** (`supabase/migrations/001`–`013`):
   ```bash
   supabase db push --db-url "$DATABASE_URL"
   ```

4. **Spustit dev server:**
   ```bash
   npm run dev
   ```

5. **Otevřít:** [http://localhost:3000](http://localhost:3000) (chat) · [http://localhost:3000/admin](http://localhost:3000/admin) (admin)

6. **Naplnit znalostní bázi:** nahrát PDF z `docs/seed-docs/` přes `/admin/documents`.

## Proměnné prostředí

| Proměnná | Účel |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API (chat) |
| `VOYAGE_API_KEY` | Voyage AI embeddingy |
| `MISTRAL_API_KEY` | Mistral (shrnutí poptávek; bez klíče se lead uloží bez shrnutí) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase projektu |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin klíč Supabase (pouze server) |
| `DATABASE_URL` | Postgres connection string (pro migrace) |
| `ADMIN_USERNAME` | Uživatelské jméno pro admin sekci |
| `ADMIN_PASSWORD` | Heslo pro admin sekci |
| `SESSION_SECRET` | Podpisový klíč admin session cookie (dlouhý náhodný řetězec, např. `openssl rand -hex 32`) |
| `CHAT_MODEL` | Model pro chat (volitelné, default `claude-sonnet-4-6`) |
| `SUMMARY_MODEL` | Model pro shrnutí poptávek (volitelné, default `mistral-small-latest`) |
| `TOP_K` | Počet výsledků retrievalu (výchozí: 5) |
| `SIMILARITY_THRESHOLD` | Práh podobnosti (výchozí: 0.35) |
| `LLM_TEMPERATURE` | Teplota Claude (výchozí: 0.2) |
| `LANGFUSE_SECRET_KEY` | Langfuse server klíč (volitelné — bez něj app funguje, jen se neloguje) |
| `LANGFUSE_PUBLIC_KEY` | Langfuse veřejný klíč (volitelné) |
| `LANGFUSE_BASE_URL` | URL Langfuse instance (default `https://cloud.langfuse.com`) |
| `KECALO_BASE_URL` | Cíl eval runneru — nasazená URL aplikace (jen pro `npm run eval`) |

`TOP_K`, `SIMILARITY_THRESHOLD` a `LLM_TEMPERATURE` jsou jen výchozí/fallback hodnoty — runtime hodnoty se čtou z DB a ladí se v `/admin/parameters`.

## Dokumentace

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — technický popis: architektura, RAG pipeline, datový model, API, bezpečnost
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — prováděcí checklist projektu (fáze 0–17 + průběžný stav)
- [docs/PRD_pojistovaci_RAG_chatbot.md](docs/PRD_pojistovaci_RAG_chatbot.md) — zadání/PRD
- [docs/plans/](docs/plans/) — feature a experimentální plány (Langfuse, poptávky, Mistral, widget, demo)
- [docs/reviews/](docs/reviews/) — nálezy a opravné plány z code/security revizí
- [docs/evaluation/](docs/evaluation/) — testovací otázky a Langfuse datasety
- [docs/seed-docs/](docs/seed-docs/) — PDF dokumenty pro znalostní bázi
