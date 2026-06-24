# Fáze 9 — Langfuse: observabilita RAG pipeline (po kurzu)

**Milník:** Každý chat dotaz, retrieval a indexace dokumentu generují trace v Langfuse dashboardu s vnořenou strukturou (retrieval → embedding → vector search → LLM generování). App funguje i bez Langfuse klíčů (graceful degradace).

> **Pozn.:** Jde o základní prototypovou integraci přes OpenTelemetry — cíl je vidět traces, latence a token usage v Langfuse Cloud (free tier, 50k eventů/měsíc). Pokročilé funkce (user feedback, prompt management, evaluace) jsou odložené — viz „Produkční dluh" na konci.

---

## Krok 9.1 — Instalace a konfigurace

### Balíčky

- [ ] `npm install @langfuse/otel @opentelemetry/sdk-trace-node @opentelemetry/api`
- [ ] Ověřit, že `package.json` obsahuje všechny tři balíčky
- [ ] `npm ls @opentelemetry/api` — **musí být jediná, deduplikovaná verze.** `@opentelemetry/api` už je v `node_modules` tranzitivně přes AI SDK (aktuálně `1.9.1`); pokud npm nainstaluje druhou verzi vedle, vznikne klasický problém „dvě kopie `@opentelemetry/api`" → globální tracer registrovaný jednou kopií není vidět druhou → **tichá ztráta traces**. Při neshodě sjednotit přes npm `overrides`.
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

- [ ] Přidat `serverExternalPackages` pro OTel balíčky (nesmí být bundlovány) — **všechny tři**, včetně `@langfuse/otel`:
  ```typescript
  const nextConfig: NextConfig = {
    serverExternalPackages: [
      "@langfuse/otel",
      "@opentelemetry/sdk-trace-node",
      "@opentelemetry/api",
    ],
  };
  ```

**Dílčí milník:** `npm run build` projde bez chyb s novými balíčky; `npm ls @opentelemetry/api` hlásí jedinou verzi.

---

## Krok 9.2 — Inicializace OTEL (`src/instrumentation.ts`)

- [ ] Vytvořit `src/instrumentation.ts` s exportovanou funkcí `register()`:
  - Podmínka `process.env.NEXT_RUNTIME === 'nodejs'` (Edge runtime se přeskočí)
  - **Span processor se zde NEvytváří** — importuje se sdílený singleton `langfuseSpanProcessor` z `@/lib/telemetry` (viz krok 9.3), aby na *tutéž* instanci dosáhl i `flushTelemetry()`. Zde se processor jen předá provideru a zaregistruje.
  - `LangfuseSpanProcessor` (definovaný v telemetry.ts) s filtrem Next.js interních spanů:
    ```typescript
    shouldExportSpan: (span) =>
      span.otelSpan.instrumentationScope.name !== "next.js"
    ```
    > Filtr propustí naše spany (scope `kecalo`) i LLM spany z AI SDK (scope `ai`) a zahodí jen interní šum Next.js. **API `@langfuse/otel` je verzově citlivé** — přesnou signaturu `shouldExportSpan` a tvar `span.otelSpan.instrumentationScope.name` ověřit podle dokumentace verze, kterou npm nainstaluje.
  - `NodeTracerProvider` se span processorem + `provider.register()` (ověřit, zda instalovaná verze `@opentelemetry/sdk-trace-node` bere `spanProcessors` v konstruktoru, nebo se přidávají přes `addSpanProcessor`)
- [ ] **Guard proti dvojí registraci:** v dev s HMR/Turbopackem se `register()` může zavolat víckrát → duplicitní provider/processor. Ochránit příznakem na `globalThis` (zaregistrovat právě jednou).
- [ ] Graceful degradace: celý blok v try/catch — pokud Langfuse env proměnné chybí, logovat warning a neregistrovat provider (app musí fungovat i bez Langfuse)

**Dílčí milník:** `npm run dev` — server nastartuje bez chyb (a bez dvojí registrace); `npm run build` projde.

---

## Krok 9.3 — Helper modul (`src/lib/telemetry.ts`)

Tento modul je **jediný zdroj pravdy** pro OTel: vytváří a drží sdílenou instanci span processoru a nabízí helpery. Importuje ho jak `instrumentation.ts` (registrace), tak všechny instrumentované soubory — nikdy se neimportuje `@opentelemetry/api` přímo.

- [ ] Vytvořit `src/lib/telemetry.ts`:
  - `langfuseSpanProcessor` — **singleton** instance `LangfuseSpanProcessor`. Drží se zde, aby na stejnou instanci dosáhl `instrumentation.ts` (registrace) i `flushTelemetry()` (flush). Vzniká jen když jsou Langfuse klíče k dispozici.
  - `getTracer()` — vrátí tracer `kecalo` z `@opentelemetry/api`
  - `withSpan<T>(name, fn, attributes?)` — wrapper **přes `tracer.startActiveSpan()`** (NE `startSpan`!), aby se span stal *aktivním v OTel kontextu* po dobu běhu `fn`. Tělo: nastav atributy → `await fn()` → při úspěchu `setStatus(OK)`, při chybě `setStatus(ERROR)` + `recordException(err)` + rethrow → **v `finally` `span.end()`**.
    > ⚠️ **`startActiveSpan`, ne `startSpan`.** `startSpan()` span vytvoří, ale **neaktivuje kontext** → vnořená `withSpan` volání i LLM span z AI SDK (`experimental_telemetry`) by se NEzařadily pod rodiče → vznikla by *placatá* struktura. Vnořená struktura je přitom hlavní milník této fáze.
    > ⚠️ `fn` musí být `async` a `withSpan` na ni musí `await`-ovat — jinak se span ukončí dřív, než async práce doběhne. (Streaming v chatu je výjimka — řeší krok 9.4 ručním uzavřením v `onFinish`.)
  - `flushTelemetry()` — `await langfuseSpanProcessor.forceFlush()` (pro `after()` callbacky v API routách; v serverless jinak traces neodejdou). No-op, když processor neexistuje.
  - **Graceful no-op:** pokud OTel není inicializovaný (chybí Langfuse klíče), `getTracer()` vrátí noop tracer a `withSpan` jen spustí `fn` bez spanu; `flushTelemetry()` nic nedělá.
- [ ] Tento modul importují všechny instrumentované soubory místo přímého importu `@opentelemetry/api`

**Dílčí milník:** modul se kompiluje, export typů je správný; vnořování se ověří v krocích 9.4/9.5.

---

## Krok 9.4 — Instrumentace chat route (hlavní hodnota)

> Toto je nejdůležitější krok — chat route je jádro RAG pipeline a generuje nejvíc pozorovatelných dat.

### Změny v `src/app/api/chat/route.ts`

> **Klíčová komplikace — streaming.** `streamText` se vrací okamžitě a generuje na pozadí; tělo POST skončí `return result.toTextStreamResponse(...)` dávno před dokončením LLM. Kdyby se `chat-pipeline` span ukončil při returnu (jak by udělal prostý `withSpan`-wrapper), latence by **nezahrnula generování** a LLM span od AI SDK by skončil až po rodiči (osiřelý span). Proto se `chat-pipeline` span **neukončuje při returnu, ale až v `onFinish`/`onError` streamu.**

- [ ] Import `withSpan`, `getTracer`, `flushTelemetry` z `@/lib/telemetry`, `after` z `next/server`
- [ ] Otevřít rodičovský span ručně přes `getTracer().startActiveSpan("chat-pipeline", async (span) => { ... })` a celé tělo POST přesunout dovnitř callbacku (callback vrací `Response`, kterou POST vrátí):
  - Atributy: `chat.message_count` (počet zpráv v historii). **Surový dotaz neukládat jako atribut** — viz poznámka o soukromí níže (volitelně `chat.query_length`).
  - `streamText` se musí volat **uvnitř** tohoto aktivního spanu, aby se LLM span z AI SDK vnořil pod `chat-pipeline`.
- [ ] Obalit `retrieve()` do `withSpan("retrieval", ...)` (je `await`-ované, uzavře se korektně samo):
  - Atributy na konci: `retrieval.chunk_count`, `retrieval.top_similarity` (max skóre), `retrieval.is_fallback` (chunks.length === 0)
- [ ] Na obě volání `streamText` (RAG i fallback větev) přidat `experimental_telemetry`:
  ```typescript
  experimental_telemetry: {
    isEnabled: true,
    functionId: "chat-rag",           // nebo "chat-fallback" pro fallback větev
    recordInputs: false,              // viz poznámka o soukromí níže
    recordOutputs: false,
    metadata: {
      topK: settings.topK,
      similarityThreshold: settings.similarityThreshold,
      llmTemperature: settings.llmTemperature,
      chunkCount: chunks.length,       // 0 pro fallback
    },
  },
  ```
- [ ] Rodičovský span ukončit **až po streamu** — do obou `streamText` přidat:
  - `onFinish`: zaznamenat `usage` (input/output tokeny) na `chat-pipeline` span → `span.setStatus(OK)` → `span.end()`
  - `onError`: stávající callback (`route.ts:58,88`) rozšířit o `span.recordException(error)` → `span.setStatus(ERROR)` → `span.end()` (vedle stávajícího `console.error`)
- [ ] Přidat `after(() => flushTelemetry())` před return (flush proběhne po doběhnutí streamu)
- [ ] Zachovat stávající `console.error` volání — Langfuse je doplňuje, ne nahrazuje

> **Poznámka o soukromí (vědomé rozhodnutí).** AI SDK má `recordInputs`/`recordOutputs` ve výchozím stavu **zapnuté** → do Langfuse Cloud by jinak šel plný text dotazů uživatelů i celé chunky reálných pojišťovacích dokumentů vložené do system promptu. Pro prototyp se nastavuje `recordInputs:false` / `recordOutputs:false` a surový dotaz se neukládá ani jako vlastní atribut. Když je pro ladění potřeba vidět obsah, lze dočasně zapnout — trvalé řešení (GDPR/retence) patří do „Produkčního dluhu".

### Ověření

- [ ] Poslat dotaz přes chat UI
- [ ] V Langfuse dashboardu se objeví trace s:
  - Názvem `chat-pipeline` (root) a vnořeným `chat-rag`
  - **Vnořeným** LLM spanem (od AI SDK) s modelem `claude-sonnet-4-6` — ověřit, že je *child* `chat-pipeline`, ne sourozenec (test správného `startActiveSpan`)
  - Vnořeným `retrieval` spanem
  - Token usage (input/output tokens) z `onFinish`
  - **Latence `chat-pipeline` ≈ retrieval + generování** (ne jen retrieval) — test, že se rodič uzavřel až v `onFinish`, ne při returnu
- [ ] Obsah promptů/odpovědí v traces **není** vidět (důsledek `recordInputs/recordOutputs:false` — záměr)
- [ ] Otestovat fallback (dotaz mimo bázi) — trace ukazuje `chat-fallback`, 0 chunků

**Dílčí milník:** Chat traces jsou viditelné v Langfuse s vnořenou strukturou; latence rodiče zahrnuje generování.

---

## Krok 9.5 — Instrumentace retrieve a embed

> Embedding se instrumentuje **pouze v `embed.ts`** (blízko HTTP volání Voyage, pokryje dotaz i batch). V `retrieve.ts` se `embedQuery` znovu neobaluje — dřívější verze plánu měla dvojí span (`retrieve.embed-query` + `embed.query`) pro tutéž operaci; to je redundantní a plýtvá kvótou.

### Změny v `src/lib/rag/embed.ts`

- [ ] Import `withSpan` z `@/lib/telemetry`
- [ ] V `embedQuery`: obalit `voyage.embed()` do `withSpan("embed.query", ...)`:
  - Atributy: `embed.model` = `"voyage-3.5"`, `embed.input_type` = `"query"`, `embed.input_length` (délka textu)
  - Po dokončení: `embed.total_tokens` z `response.usage?.totalTokens` (jinak Voyage náklady v Langfuse úplně chybí — viz Gotchas)
- [ ] V `embedBatch`: obalit každý batch do `withSpan("embed.batch", ...)`:
  - Atributy: `embed.model`, `embed.input_type` = `"document"`, `embed.batch_size`, `embed.batch_index`, `embed.total_texts`
  - Po dokončení: `embed.total_tokens` z `response.usage?.totalTokens`

### Změny v `src/lib/rag/retrieve.ts`

- [ ] Import `withSpan` z `@/lib/telemetry`
- [ ] **Neobalovat `embedQuery` zvlášť** — instrumentace embeddingu je v `embed.ts` a span se vnoří automaticky (`retrieve` poběží uvnitř aktivního `retrieval` spanu z kroku 9.4).
- [ ] Obalit `supabase.rpc('match_chunks')` do `withSpan("vector-search", ...)`:
  - Atributy: `search.match_threshold`, `search.match_count` (= topK)
  - Po dokončení: `search.result_count`, `search.top_similarity`

### Ověření

- [ ] Poslat dotaz přes chat — v Langfuse trace vidět vnořené spany:
  ```
  chat-pipeline
    ├── retrieval
    │   ├── embed.query        (Voyage AI — z embed.ts)
    │   └── vector-search      (Supabase RPC)
    └── chat-rag → ai.streamText (Claude) — automaticky od AI SDK
  ```
- [ ] Ověřit, že embedding má **právě jeden** span (žádná duplicita) a že latence jednotlivých kroků jsou realistické

**Dílčí milník:** Každý krok RAG pipeline má vlastní span s latencí a metadaty; embedding dotazu je instrumentován jen jednou.

---

## Krok 9.6 — Instrumentace document pipeline

### Změny v `src/lib/rag/pipeline.ts`

> V `processDocument` jsou kroky **inline** (ne samostatné funkce), takže `withSpan` se obtočí kolem příslušných bloků/volání. Protože `withSpan` používá `startActiveSpan` (krok 9.3), vnořené spany se zařadí samy — včetně `embed.batch` spanů z kroku 9.5, které se objeví pod `document.embed-batch`.

- [ ] Import `withSpan`, `flushTelemetry` z `@/lib/telemetry`
- [ ] Obalit celý `processDocument` do `withSpan("document.process", ...)`:
  - Atributy: `document.id`, `document.filename`, `document.mime_type`
- [ ] Vnořené spany pro každý krok:
  - `document.download` — stažení ze Storage
  - `document.extract` — extrakce textu (atribut `extract.page_count`)
  - `document.chunk` — chunking (atribut `chunk.count`)
  - `document.embed-batch` — embeddingy (atribut `embed.total_texts`; pod ním se vnoří `embed.batch` spany z kroku 9.5)
  - `document.insert-chunks` — zápis do DB (atribut `insert.batch_count`)
- [ ] Na konci `processDocument` (v `finally`): `await flushTelemetry()`
  — `processDocument` běží v `after()` kontextu, flush je nutný

### Změny v `src/app/api/documents/route.ts`

- [ ] V POST handleru přidat span `document.upload` kolem uploadu do Storage + insertu do DB (soubor už `after` z `next/server` importuje — `documents/route.ts:1`)

### Ověření

- [ ] Nahrát dokument přes admin UI
- [ ] V Langfuse vidět trace `document.process` s vnořenou strukturou a celkovou dobou indexace
- [ ] Při chybě (např. nečitelný soubor) vidět červený error span

**Dílčí milník:** Indexace dokumentu je plně trasována — vidět bottlenecky (typicky embed-batch).

---

## Krok 9.7 — Instrumentace retrieval-test route

### Změny v `src/app/api/retrieval-test/route.ts`

- [ ] Import `after` z `next/server` (soubor ho zatím neimportuje) a `withSpan`, `flushTelemetry` z `@/lib/telemetry`
- [ ] Přidat `export const maxDuration = 60` (soubor ho zatím nemá — kvůli `after()` flush)
- [ ] Obalit do `withSpan("retrieval-test", ...)` (analogicky chat route, ale jednodušší — jen retrieval, žádné LLM, takže se uzavře synchronně po `await retrieve()`)
- [ ] Přidat `after(() => flushTelemetry())`
- [ ] Atributy: `test.result_count` (surový dotaz neukládat — konzistence s rozhodnutím o soukromí z kroku 9.4; volitelně `test.query_length`)
- [ ] Pozn.: `retrieve()` už je instrumentovaná z kroku 9.5 — `vector-search` span se automaticky vnoří

### Ověření

- [ ] Spustit test retrievalu v admin UI
- [ ] V Langfuse vidět trace `retrieval-test` s vnořeným `vector-search` spanem

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
  - `src/instrumentation.ts` — registrace OTel provideru + Langfuse span processoru
  - `src/lib/telemetry.ts` — jediný zdroj pravdy pro OTel: singleton span processoru + helpery (`getTracer`, `withSpan` přes `startActiveSpan`, `flushTelemetry`)
  - Všechny API routes emitují traces do Langfuse přes OTel; chat route drží rodičovský span otevřený do `onFinish` streamu
  - AI SDK `experimental_telemetry` automaticky trasuje LLM volání (s `recordInputs/recordOutputs:false`)
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
  - [ ] Každý trace má vnořenou strukturu (retrieval → embed.query + vector-search; chat-rag → LLM span)
  - [ ] LLM span je **child** `chat-pipeline` (ne sourozenec) a latence rodiče zahrnuje generování
  - [ ] Token usage je vyplněný (input tokens, output tokens) z `onFinish`
  - [ ] Embedding má právě jeden span (žádná duplicita)
  - [ ] Metadata (topK, threshold, temperature) jsou viditelná; obsah promptů viditelný není (záměr)
- [ ] Nahrát dokument — ověřit trace `document.process`
- [ ] Spustit retrieval test — ověřit trace `retrieval-test`

### Bez Langfuse klíčů (graceful degradace)

- [ ] Odebrat `LANGFUSE_*` z `.env.local`
- [ ] Restartovat dev server
- [ ] Ověřit, že app funguje normálně bez chyb (chat, upload, retrieval test)

**Konečný milník:** Každá interakce s Kecalo (chat, upload, retrieval test) generuje strukturovaný trace v Langfuse s latencí, tokeny a metadaty. App funguje i bez Langfuse klíčů.

---

## Nové soubory

| Soubor | Účel |
|---|---|
| `src/instrumentation.ts` | Registrace OTel provideru + Langfuse span processoru (s guardem proti dvojí registraci) |
| `src/lib/telemetry.ts` | Jediný zdroj pravdy pro OTel: singleton span processoru + helpery `getTracer()`, `withSpan()` (přes `startActiveSpan`), `flushTelemetry()` |

## Modifikované soubory

| Soubor | Změna |
|---|---|
| `next.config.ts` | `serverExternalPackages` pro všechny tři OTel balíčky |
| `src/app/api/chat/route.ts` | Rodičovský span přes `startActiveSpan` uzavřený v `onFinish`/`onError` + `experimental_telemetry` + `flushTelemetry` |
| `src/lib/rag/retrieve.ts` | Span `vector-search` (embedding je instrumentován v embed.ts) |
| `src/lib/rag/embed.ts` | Spany `embed.query` / `embed.batch` + `embed.total_tokens` |
| `src/lib/rag/pipeline.ts` | Spany pro celou indexační pipeline + flush v `finally` |
| `src/app/api/retrieval-test/route.ts` | Import `after` + `maxDuration` + span + `flushTelemetry` |
| `src/app/api/documents/route.ts` | Span `document.upload` |
| `.env.example` | `LANGFUSE_*` proměnné |

---

## Gotchas

- **Edge runtime** není podporován — Kecalo používá Node.js, OK
- **`forceFlush()`** je povinný v serverless — jinak se traces neodešlou
- **`startActiveSpan`, ne `startSpan`** — jinak se vnořené spany ani AI SDK LLM span nezařadí pod rodiče (placatá struktura). Viz krok 9.3.
- **Streaming** — rodičovský `chat-pipeline` span ukončit v `onFinish`/`onError`, **ne** při odeslání response (jinak latence nezahrne generování a LLM span osiří). Viz krok 9.4.
- **Dvě kopie `@opentelemetry/api`** — balíček už je v projektu tranzitivně; druhá verze vedle = tracer registrovaný jednou kopií není vidět druhou → tichá ztráta traces. Ověřit `npm ls @opentelemetry/api`. Viz krok 9.1.
- **Dvojí `register()` v dev/HMR** — Turbopack může `instrumentation.register()` zavolat víckrát → duplicitní processory. Guard přes `globalThis`. Viz krok 9.2.
- **`@langfuse/otel` API je verzově citlivé** — `shouldExportSpan`, tvar `span.otelSpan.*` a konstruktor `NodeTracerProvider` ověřit podle dokumentace nainstalované verze
- **Next.js interní spany** filtrovat přes `shouldExportSpan`, jinak šum + zbytečná spotřeba kvóty
- **Soukromí** — AI SDK `recordInputs/recordOutputs` jsou defaultně zapnuté; pro prototyp vypnuté (krok 9.4), jinak by do Langfuse šel plný obsah dotazů i dokumentů
- **Voyage AI náklady** se nepočítají automaticky — nutné přidat custom model v Langfuse dashboardu (a posílat `embed.total_tokens`, krok 9.5)
- **Vercel Hobby plán** nemusí podporovat OTel export v produkci

---

## Produkční dluh (po Fázi 9, odložené)

- User feedback z frontendu (`@langfuse/browser`) — tlačítko palec nahoru/dolů u odpovědi
- Prompt management přes Langfuse (verzování systémového promptu)
- Langfuse evaluace — automatické skórování odpovědí (relevance, faithfulness)
- Session tracking — sdružení více dotazů do jedné konverzace přes `sessionId`
- User ID propagace — identifikace uživatelů v traces
- Logování obsahu promptů/odpovědí (`recordInputs/recordOutputs`) s ošetřením GDPR/retence — teď vypnuté kvůli soukromí
- Nákladové reporty — Voyage AI custom model definition v Langfuse pro přesné kalkulace
- Dashboard metriky z Langfuse API (průměrná latence, fallback rate, token spotřeba)
