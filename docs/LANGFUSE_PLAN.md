# Fáze 9 — Langfuse: observabilita RAG pipeline (po kurzu)

**Milník:** Každý chat dotaz, retrieval a indexace dokumentu generují trace v Langfuse dashboardu s vnořenou strukturou (retrieval → embedding → vector search → LLM generování). App funguje i bez Langfuse klíčů (graceful degradace).

> **Pozn.:** Jde o základní prototypovou integraci přes OpenTelemetry — cíl je vidět traces, latence a token usage v Langfuse Cloud (free tier, 50k eventů/měsíc). Pokročilé funkce (user feedback, prompt management, evaluace) jsou odložené — viz „Produkční dluh" na konci.

---

## Krok 9.1 — Instalace a konfigurace

### Balíčky

- [ ] `npm install @langfuse/otel @opentelemetry/sdk-trace-node @opentelemetry/api`
- [ ] Ověřit, že `package.json` obsahuje všechny tři balíčky
- [ ] `npm run build` — ověřit, že build projde bez chyb

### Env proměnné

- [ ] Založit účet na https://cloud.langfuse.com (free tier)
- [ ] Vytvořit nový projekt „Kecalo" v Langfuse dashboardu
- [ ] Získat `LANGFUSE_SECRET_KEY` a `LANGFUSE_PUBLIC_KEY` z Project Settings → API Keys
- [ ] Přidat do `.env.local`:
  ```
  LANGFUSE_SECRET_KEY=sk-lf-...
  LANGFUSE_PUBLIC_KEY=pk-lf-...
  LANGFUSE_BASE_URL=https://cloud.langfuse.com
  ```
- [ ] Přidat do `.env.example` (prázdné hodnoty):
  ```
  # Langfuse observabilita (volitelné — bez nich app funguje, jen se neloguje)
  LANGFUSE_SECRET_KEY=
  LANGFUSE_PUBLIC_KEY=
  LANGFUSE_BASE_URL=https://cloud.langfuse.com
  ```

### next.config.ts

- [ ] Přidat `serverExternalPackages` pro OTel balíčky (nesmí být bundlovány):
  ```typescript
  const nextConfig: NextConfig = {
    serverExternalPackages: [
      "@opentelemetry/sdk-trace-node",
      "@opentelemetry/api",
    ],
  };
  ```

**Dílčí milník:** `npm run build` projde bez chyb s novými balíčky.

---

## Krok 9.2 — Inicializace OTEL (`src/instrumentation.ts`)

- [ ] Vytvořit `src/instrumentation.ts` s exportovanou funkcí `register()`:
  - Podmínka `process.env.NEXT_RUNTIME === 'nodejs'`
  - `LangfuseSpanProcessor` s filtrem Next.js interních spanů:
    ```typescript
    shouldExportSpan: (span) =>
      span.otelSpan.instrumentationScope.name !== "next.js"
    ```
  - `NodeTracerProvider` se span processorem
- [ ] Graceful degradace: celý blok v try/catch — pokud Langfuse env proměnné chybí, logovat warning a neregistrovat provider (app musí fungovat i bez Langfuse)

**Dílčí milník:** `npm run dev` — server nastartuje bez chyb; `npm run build` projde.

---

## Krok 9.3 — Helper modul (`src/lib/telemetry.ts`)

- [ ] Vytvořit `src/lib/telemetry.ts` s centralizovanou OTel logikou:
  - `getTracer()` — vrátí tracer `kecalo` z `@opentelemetry/api`
  - `withSpan<T>(name, fn, attributes?)` — wrapper: start span → run fn → set status → end span; při chybě `span.setStatus(ERROR)` + `span.recordException(err)`
  - `flushTelemetry()` — zavolá `forceFlush()` na span processoru (pro `after()` callbacky v API routách)
  - Graceful no-op: pokud OTel není inicializovaný (chybí Langfuse klíče), helpery nic nedělají (noop tracer)
- [ ] Tento modul importují všechny instrumentované soubory místo přímého importu `@opentelemetry/api`

**Dílčí milník:** modul se kompiluje, export typů je správný.

---

## Krok 9.4 — Instrumentace chat route (hlavní hodnota)

> Toto je nejdůležitější krok — chat route je jádro RAG pipeline a generuje nejvíc pozorovatelných dat.

### Změny v `src/app/api/chat/route.ts`

- [ ] Import `withSpan`, `flushTelemetry` z `@/lib/telemetry`, `after` z `next/server`
- [ ] Celé tělo POST obalit do `withSpan("chat-pipeline", ...)`:
  - Atributy: `chat.query` (text dotazu), `chat.message_count` (počet zpráv v historii)
- [ ] Obalit `retrieve()` do `withSpan("retrieval", ...)`:
  - Atributy na konci: `retrieval.chunk_count`, `retrieval.top_similarity` (max skóre), `retrieval.is_fallback` (chunks.length === 0)
- [ ] Na obě volání `streamText` přidat:
  ```typescript
  experimental_telemetry: {
    isEnabled: true,
    functionId: "chat-rag",           // nebo "chat-fallback" pro fallback větev
    metadata: {
      topK: settings.topK,
      similarityThreshold: settings.similarityThreshold,
      llmTemperature: settings.llmTemperature,
      chunkCount: chunks.length,       // 0 pro fallback
    },
  },
  ```
- [ ] Přidat `after(() => flushTelemetry())` před return
- [ ] Zachovat stávající `console.error` volání — Langfuse je doplňuje, ne nahrazuje

### Ověření

- [ ] Poslat dotaz přes chat UI
- [ ] V Langfuse dashboardu se objeví trace s:
  - Názvem `chat-pipeline` / `chat-rag`
  - Vnořeným LLM spanem (od AI SDK) s modelem `claude-sonnet-4-6`
  - Vnořeným `retrieval` spanem
  - Token usage (input/output tokens)
  - Latencí každého kroku
- [ ] Otestovat fallback (dotaz mimo bázi) — trace ukazuje `chat-fallback`, 0 chunků

**Dílčí milník:** Chat traces jsou viditelné v Langfuse s vnořenou strukturou.

---

## Krok 9.5 — Instrumentace retrieve a embed

### Změny v `src/lib/rag/retrieve.ts`

- [ ] Import `withSpan` z `@/lib/telemetry`
- [ ] Obalit `embedQuery(query)` do `withSpan("retrieve.embed-query", ...)`:
  - Atributy: `embed.model` = `"voyage-3.5"`, `embed.input_type` = `"query"`
- [ ] Obalit `supabase.rpc('match_chunks')` do `withSpan("retrieve.vector-search", ...)`:
  - Atributy: `search.match_threshold`, `search.match_count` (= topK)
  - Po dokončení: `search.result_count`, `search.top_similarity`

### Změny v `src/lib/rag/embed.ts`

- [ ] Import `withSpan` z `@/lib/telemetry`
- [ ] V `embedQuery`: obalit `voyage.embed()` do `withSpan("embed.query", ...)`:
  - Atributy: `embed.model`, `embed.input_type`, `embed.input_length` (délka textu)
- [ ] V `embedBatch`: obalit každý batch do `withSpan("embed.batch", ...)`:
  - Atributy: `embed.model`, `embed.batch_size`, `embed.batch_index`, `embed.total_texts`

### Ověření

- [ ] Poslat dotaz přes chat — v Langfuse trace vidět vnořené spany:
  ```
  chat-pipeline
    └── retrieval
        ├── embed.query (Voyage AI)
        └── vector-search (Supabase RPC)
    └── ai.streamText (Claude) — automaticky od AI SDK
  ```
- [ ] Ověřit, že latence jednotlivých kroků jsou realistické

**Dílčí milník:** Každý krok RAG pipeline má vlastní span s latencí a metadaty.

---

## Krok 9.6 — Instrumentace document pipeline

### Změny v `src/lib/rag/pipeline.ts`

- [ ] Import `withSpan`, `flushTelemetry` z `@/lib/telemetry`
- [ ] Obalit celý `processDocument` do `withSpan("document.process", ...)`:
  - Atributy: `document.id`, `document.filename`, `document.mime_type`
- [ ] Vnořené spany pro každý krok:
  - `document.download` — stažení ze Storage
  - `document.extract` — extrakce textu (s atributem `extract.page_count`)
  - `document.chunk` — chunking (s atributem `chunk.count`)
  - `document.embed-batch` — embeddingy (s atributem `embed.total_texts`)
  - `document.insert-chunks` — zápis do DB (s atributem `insert.batch_count`)
- [ ] Na konci `processDocument` (v `finally`): `await flushTelemetry()`
  — `processDocument` běží v `after()` kontextu, flush je nutný

### Změny v `src/app/api/documents/route.ts`

- [ ] V POST handleru přidat span `document.upload` kolem uploadu do Storage + insertu do DB

### Ověření

- [ ] Nahrát dokument přes admin UI
- [ ] V Langfuse vidět trace `document.process` s vnořenou strukturou a celkovou dobou indexace
- [ ] Při chybě (např. nečitelný soubor) vidět červený error span

**Dílčí milník:** Indexace dokumentu je plně trasována — vidět bottlenecky (typicky embed-batch).

---

## Krok 9.7 — Instrumentace retrieval-test route

### Změny v `src/app/api/retrieval-test/route.ts`

- [ ] Obalit do `withSpan("retrieval-test", ...)` (analogicky chat route, ale jednodušší — jen retrieval, žádné LLM)
- [ ] Přidat `after(() => flushTelemetry())`
- [ ] Atributy: `test.query`, `test.result_count`
- [ ] Pozn.: `retrieve()` už bude instrumentovaná z kroku 9.5 — span se automaticky vnoří

### Ověření

- [ ] Spustit test retrievalu v admin UI
- [ ] V Langfuse vidět trace `retrieval-test` s vnořeným `retrieval` spanem

---

## Krok 9.8 — Dokumentace

### CLAUDE.md

- [ ] Přidat do tabulky env proměnných:
  ```
  | LANGFUSE_SECRET_KEY  | Langfuse server klíč (volitelný — bez něj app funguje) |
  | LANGFUSE_PUBLIC_KEY  | Langfuse veřejný klíč (volitelný) |
  | LANGFUSE_BASE_URL    | URL Langfuse instance (default cloud.langfuse.com) |
  ```
- [ ] Přidat do sekce „Architektura" popis observability:
  - `src/instrumentation.ts` — inicializace OTel + Langfuse span processor
  - `src/lib/telemetry.ts` — helpery pro custom spany (`withSpan`, `flushTelemetry`)
  - Všechny API routes emitují traces do Langfuse přes OTel
  - AI SDK `experimental_telemetry` automaticky trasuje LLM volání
- [ ] Přidat nové soubory do adresářové struktury

### docs/IMPLEMENTATION_PLAN.md

- [ ] Zaškrtnout hotové kroky ve Fázi 9
- [ ] Přidat nové soubory do adresářové struktury
- [ ] V „Produkční dluh" nahradit „Monitoring nákladů a latence" odkazem na Fázi 9

---

## Krok 9.9 — E2E ověření a smoke test

### Lokální ověření

- [ ] `npm run lint` — bez chyb
- [ ] `npm run build` — bez chyb
- [ ] `npm run dev` — server nastartuje
- [ ] Poslat 3 různé dotazy přes chat (včetně jednoho fallback dotazu)
- [ ] Otevřít Langfuse dashboard — ověřit:
  - [ ] 3 traces pro chat (2× chat-rag, 1× chat-fallback)
  - [ ] Každý trace má vnořenou strukturu (retrieval, embed, vector-search, LLM)
  - [ ] Token usage je vyplněný (input tokens, output tokens)
  - [ ] Latence jednotlivých kroků jsou realistické
  - [ ] Metadata (topK, threshold, temperature) jsou viditelná
- [ ] Nahrát dokument — ověřit trace `document.process`
- [ ] Spustit retrieval test — ověřit trace `retrieval-test`

### Bez Langfuse klíčů (graceful degradace)

- [ ] Odebrat `LANGFUSE_*` z `.env.local`
- [ ] Restartovat dev server
- [ ] Ověřit, že app funguje normálně bez chyb

**Konečný milník:** Každá interakce s Kecalo (chat, upload, retrieval test) generuje strukturovaný trace v Langfuse s latencí, tokeny a metadaty. App funguje i bez Langfuse klíčů.

---

## Nové soubory

| Soubor | Účel |
|---|---|
| `src/instrumentation.ts` | Inicializace OTel + Langfuse span processor |
| `src/lib/telemetry.ts` | Helpery: `getTracer()`, `withSpan()`, `flushTelemetry()` |

## Modifikované soubory

| Soubor | Změna |
|---|---|
| `next.config.ts` | `serverExternalPackages` pro OTel |
| `src/app/api/chat/route.ts` | OTel spany + `experimental_telemetry` + `forceFlush` |
| `src/lib/rag/retrieve.ts` | Spany pro embedding + vector search |
| `src/lib/rag/embed.ts` | Spany pro `embedQuery` a `embedBatch` |
| `src/lib/rag/pipeline.ts` | Spany pro celou indexační pipeline |
| `src/app/api/retrieval-test/route.ts` | Span + `forceFlush` |
| `src/app/api/documents/route.ts` | Span pro upload |
| `.env.example` | `LANGFUSE_*` proměnné |

---

## Gotchas

- **Edge runtime** není podporován — Kecalo používá Node.js, OK
- **`forceFlush()`** je povinný v serverless — jinak se traces neodešlou
- **Next.js interní spany** filtrovat přes `shouldExportSpan`, jinak šum + zbytečná spotřeba kvóty
- **Streaming** vyžaduje správné ukončení spanů (v `onFinish`, ne při odeslání response)
- **Voyage AI náklady** se nepočítají automaticky — nutné přidat custom model v Langfuse dashboardu
- **Vercel Hobby plán** nemusí podporovat OTel export v produkci

---

## Produkční dluh (po Fázi 9, odložené)

- User feedback z frontendu (`@langfuse/browser`) — tlačítko palec nahoru/dolů u odpovědi
- Prompt management přes Langfuse (verzování systémového promptu)
- Langfuse evaluace — automatické skórování odpovědí (relevance, faithfulness)
- Session tracking — sdružení více dotazů do jedné konverzace přes `sessionId`
- User ID propagace — identifikace uživatelů v traces
- Nákladové reporty — Voyage AI custom model definition v Langfuse pro přesné kalkulace
- Dashboard metriky z Langfuse API (průměrná latence, fallback rate, token spotřeba)
