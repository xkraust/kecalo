# Plán: Hlasové ovládání Kecala přes Gemini Live API

## Kontext a cíl

Umožnit uživateli **mluvit na Kecala a slyšet odpověď** — místo psaní do
vstupního řádku stiskne tlačítko mikrofonu, položí dotaz česky a odpověď se
mu přehraje nahlas. Chatová bublina i psaný vstup zůstávají beze změny; hlas
je alternativní vstupně-výstupní kanál nad **stejnou RAG pipeline**.

Rozsah tohoto plánu je **Fáze 1 — hlas jako vstup/výstup** (varianta A z ověření
proveditelnosti, 2. 9. 2026). Plnohodnotný hlasový agent, kde konverzaci drží
Gemini a RAG volá jako nástroj, je popsaný na konci jako **Výhled fáze 2** a je
vědomě odložený.

## Rozhodnutí (potvrzeno uživatelem, 2. 9. 2026)

- **Chat, RAG, retrieval, prompty i grounding zůstávají na Claude/Anthropicu.**
  Gemini Live se použije výhradně jako převod řeč → text a text → řeč.
- **Žádná změna `/api/chat`, `prompts.ts`, DB schématu ani evalů.** Hlasový vstup
  jde do stávající routy jako obyčejný text, výstup se čte z odpovědi.
- **Klient se připojuje k Googlu přímo** přes krátkodobý (ephemeral) token.
  Server-to-server WebSocket proxy je vyloučená — Vercel je serverless, routy
  mají `maxDuration = 60` a dlouhoběžící socket tam nepostavíme.
- **Hlas je opt-in**: tlačítko mikrofonu, ne automatické naslouchání. První
  aktivace zobrazí hlášku o zpracování hlasu třetí stranou (GDPR).
- Nasazuje se do **widgetu i fullscreen chatu** — logika jde do sdíleného hooku,
  stejně jako u `useKecaloChat()`.

## Ověřená fakta o Live API (2. 9. 2026)

Zdroje: [Live API overview](https://ai.google.dev/gemini-api/docs/live-api),
[capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities),
[ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens),
[pricing](https://ai.google.dev/gemini-api/docs/pricing).

- Stavové **WebSocket** spojení na `generativelanguage.googleapis.com`,
  plně duplexní.
- Audio vstup: **raw PCM 16bit, 16 kHz, little-endian**. Audio výstup: **PCM
  16bit, 24 kHz**. Ani jedno neodpovídá tomu, co dá `getUserMedia` nebo přehraje
  `<audio>` — nutná vlastní audio vrstva (viz Milník 2).
- **Čeština je podporovaná** (`cs` v seznamu 97 jazyků) — hlavní rizikový bod
  je zelený.
- Modely: `gemini-3.1-flash-live-preview`, `gemini-2.5-flash-native-audio-preview-12-2025`.
  Native-audio modely mají kontext 128k, ostatní Live modely 32k.
- **Session audio-only max 15 minut** (audio + video 2 minuty). Delší jen přes
  session resumption.
- **VAD** (detekce konce promluvy) je serverová a defaultně zapnutá; parametry
  `silenceDurationMs` (doporučeno 500–800 ms) a `prefixPaddingMs`. Jde vypnout
  a řídit ručně přes `activityStart`/`activityEnd`.
- **Ephemeral tokeny**: backend si je vyžádá svým API klíčem, default platnost
  **1 minuta na navázání session a 30 minut na provoz**, `uses: 1`. Jdou
  **zamknout na model, modality i system instruction** (`lockAdditionalFields`).
  Podporované jen v Gemini Developer API, `apiVersion: 'v1alpha'`.
- SDK: **`@google/genai`**, server `ai.authTokens.create({ config: { uses, expireTime,
  newSessionExpireTime, httpOptions: { apiVersion: 'v1alpha' } } })`, klient
  `new GoogleGenAI({ apiKey: token.name, httpOptions: { apiVersion: 'v1alpha' } })`
  a `ai.live.connect(...)`. **Přesné názvy polí ověřit z typové nápovědy po
  instalaci** — API je v alpha verzi a tvar se může lišit.
- **Cena**: audio se účtuje ~25 tokenů/s (1 500 tok/min), audio vstup $1/M,
  audio výstup $20/M tokenů. Minuta hovoru vychází řádově na **0,3–0,4 Kč**.

## Výchozí stav (zjištěno průzkumem kódu)

- Veškerá chatová logika je v `src/lib/use-kecalo-chat.ts` (`useKecaloChat()`);
  `sendMessage(text)` je jediný vstupní bod — hlasový přepis do něj půjde beze
  změny podpisu.
- `src/app/page.tsx` a `src/components/ChatWidget.tsx` jsou dva skelety nad
  jedním hookem; obojí má vstupní řádek s tlačítkem odeslat, kam přibude
  mikrofon.
- `POST /api/chat` je veřejná routa s rate limitem 20/min na IP
  (`lib/rate-limit.ts`), vrací `text/plain` stream + `X-Sources` a `X-Trace-Id`.
- `/` i `/demo` jsou **veřejné stránky mimo proxy vrstvu** — cokoli nového
  musí počítat s anonymním provozem.

---

## Milník 1 — Serverová routa pro ephemeral token

Cíl: klient si umí vyžádat krátkodobý token, aniž by se `GEMINI_API_KEY` dostal
do prohlížeče.

- [ ] **1.1** `npm i @google/genai`. Ověřit, že verze balíčku má
  `authTokens.create` i `live.connect` (alpha API — viz Rizika).
- [ ] **1.2** Nová env `GEMINI_API_KEY` (server only) + volitelná `VOICE_MODEL`
  (default `gemini-2.5-flash-native-audio-preview-12-2025`). Doplnit do
  `.env.example`, `src/lib/config.ts` a na Vercel **Project** env (ne jen
  Shared) + redeploy.
- [ ] **1.3** Nová routa `POST /api/voice/token` (`src/app/api/voice/token/route.ts`):
  - vlastní rate limit přes `createRateLimiter` — **přísnější než chat**,
    návrh 5 session / hodinu na IP (`clientIp(request)`); při překročení 429
    s českou hláškou;
  - bez `GEMINI_API_KEY` vrací **503** s hláškou „hlasové ovládání není
    nakonfigurováno" (aplikace bez klíče funguje dál, jen bez hlasu — stejný
    vzor jako Langfuse a OIDC);
  - token se vytváří s `uses: 1`, `newSessionExpireTime` +1 min,
    `expireTime` +15 min (odpovídá limitu audio-only session — delší platnost
    nemá smysl a jen zvětšuje okno zneužití);
  - **zamknout model i `responseModalities`** přes `lockAdditionalFields`,
    aby si klient s tokenem nemohl objednat jiný (dražší) model;
  - odpověď: `{ token, model, expiresAt }`, nic víc.
- [ ] **1.4** Instrumentace: span `voice.token` přes `withSpan` (jen metadata —
  úspěch/selhání, nikdy token).

**Rizika**

- `@google/genai` je pro tokeny v `v1alpha`; **stejné `httpOptions` musí být
  u vytvoření tokenu i u připojení**, jinak spojení selže na autentizaci.
- Routa je veřejná a stojí peníze u třetí strany. Rate limit je jediná ochrana —
  in-memory limiter na Vercelu navíc **nedrží napříč instancemi**, takže reálný
  strop je vyšší než nastavený. Pokud se hlas nasadí na produkci s reálným
  provozem, chce to limit v DB nebo Vercel KV (poznamenat jako dluh).

**Verifikace**

- `curl -X POST .../api/voice/token` vrátí token; šestý pokus ve stejné hodině
  vrátí 429.
- Bez `GEMINI_API_KEY` vrací 503 a zbytek aplikace funguje.

---

## Milník 2 — Klientská audio vrstva (hook `useVoiceSession`)

Cíl: nový hook, který zvládne mikrofon, spojení a přehrávání — nezávisle na
chatu, aby šel testovat samostatně.

- [ ] **2.1** Nový `src/lib/use-voice-session.ts` (`"use client"`):
  - `getUserMedia({ audio: true })`, `AudioContext` + **AudioWorklet** pro
    downsampling na **16 kHz mono PCM16** (prohlížeč typicky dává 44,1/48 kHz
    Float32 — bez převodu Live API zvuk nerozumí);
  - připojení `ai.live.connect()` s tokenem z `/api/voice/token`;
  - odesílání audio chunků, příjem `serverContent` s transkriptem a audiem;
  - přehrávání příchozího **24 kHz PCM** přes `AudioBufferSourceNode`
    s frontou (chunky chodí průběžně, `<audio>` je na to nepoužitelné);
  - stavy: `idle` / `connecting` / `listening` / `speaking` / `error`;
  - úklid: zavření socketu, `track.stop()` na mikrofonu, zavření `AudioContext`
    — v `useEffect` cleanupu i při unmountu (stejná disciplína jako
    `abortRef` v `useKecaloChat`).
- [ ] **2.2** Konfigurace session: `responseModalities: ["AUDIO"]` pro čtení
  odpovědi, `inputAudioTranscription` zapnuté (potřebujeme text dotazu pro
  `/api/chat`), jazyk `cs`.
- [ ] **2.3** Ošetřit odepření mikrofonu (`NotAllowedError`) a nepodporovaný
  prohlížeč — hlasové tlačítko se v takovém případě jen skryje/zašedne,
  psaný chat funguje dál.

**Rizika**

- **iOS Safari**: `AudioContext` se smí vytvořit až z uživatelského gesta a
  přehrávání nesmí startovat automaticky. Hook proto musí `AudioContext`
  zakládat až v handleru kliknutí, ne v `useEffect`.
- Ozvěna: při přehrávání odpovědi z reproduktoru se zvuk vrací do mikrofonu.
  Ve fázi 1 to řeší **push-to-talk** (mikrofon je otevřený jen během držení
  tlačítka), proto se s ním začíná — plné hands-free patří až do fáze 2.
- Session padne po 15 minutách. Ve fázi 1 nevadí (session je krátká, jedna
  otázka), ale hook musí umět tiše navázat novou.

**Verifikace**

- Samostatná testovací stránka nebo dev-only tlačítko: řekni českou větu →
  v konzoli se objeví správný přepis; přehraj testovací text → slyšíš češtinu.
- Zavření panelu / odchod ze stránky uvolní mikrofon (zhasne indikátor
  v prohlížeči).

---

## Milník 3 — Napojení na chat

Cíl: mluvený dotaz projde stávající RAG pipeline a odpověď se přečte.

- [ ] **3.1** Tok: přepis z `useVoiceSession` → `sendMessage(text)` z
  `useKecaloChat` → stream odpovědi → po dokončení se **finální text** pošle
  do Live session k přečtení. Předčítat průběžně během streamu **ne** —
  Claude formuluje po větách a přerušovaná syntéza zní špatně.
- [ ] **3.2** Text pro čtení očistit: odstranit markdown (`react-markdown` se
  na to nepoužije, stačí jednoduchý strip), token `[[NABIDKA]]` je už
  odstraněný v hooku. **Citace formátu „čl. 29 odst. 8, strana 11" nechat** —
  nahlas znějí neobratně, ale vypustit je by porušilo pravidlo, že bot vždy
  uvádí zdroj. Alternativu (hlasový styl odpovědi) řeš až ve fázi 2.
- [ ] **3.3** UI: tlačítko mikrofonu ve vstupní liště `/` i `ChatWidget`
  (lucide `Mic` / `MicOff`, korálový akcent v aktivním stavu), vizuální
  indikace nahrávání a přehrávání, tlačítko „přestat mluvit".
- [ ] **3.4** Přepis se zobrazí jako **normální uživatelská bublina** — hlas
  nesmí vytvořit paralelní historii, jinak se rozejde s tím, co se posílá
  do `/api/chat`.
- [ ] **3.5** GDPR hláška před prvním použitím: krátký text, že se nahrávka
  zpracuje u Googlu, s potvrzením uloženým v `localStorage`.

**Rizika**

- Přepis může obsahovat cokoli — do `/api/chat` jde jako běžný text, takže
  platí stávající limity (`MAX_MESSAGE_LENGTH` 4 000 znaků) i anti-injection
  pravidla systémového promptu. **Žádná nová validace se nevynechává.**
- Rate limit `/api/chat` (20/min) platí i pro hlasové dotazy — nezvyšovat.

**Verifikace (E2E)**

- Mluvený dotaz na pojistné podmínky → správná odpověď z báze, blok zdrojů
  v UI, odpověď přečtena česky.
- Mluvený dotaz mimo bázi → fallback hláška (statická větev bez LLM) se také
  přečte.
- Produktový dotaz → karta poptávky se zobrazí jako u psaného chatu.
- Widget: minimalizace během mluvení, obnovení konverzace, „Nová konverzace"
  ukončí i hlasovou session.
- Mobil (iOS Safari + Android Chrome): mikrofon i přehrávání.

---

## Milník 4 — Dokumentace a úklid

- [ ] **4.1** `CLAUDE.md`: nová sekce o hlasovém kanálu, `GEMINI_API_KEY` a
  `VOICE_MODEL` do tabulky env, `/api/voice/token` do seznamu rout,
  `use-voice-session.ts` do adresářové struktury.
- [ ] **4.2** `docs/ARCHITECTURE.md`: hlas jako alternativní I/O nad
  nezměněnou RAG pipeline; explicitně, že grounding zůstává na Claude.
- [ ] **4.3** Zaškrtnout v tomto plánu a doplnit stav do
  `docs/IMPLEMENTATION_PLAN.md` (mimo číslované fáze).
- [ ] **4.4** Zeptat se uživatele na commit a push.

---

## Co tento plán vědomě neřeší (produkční dluh)

- **Rate limit napříč instancemi** — in-memory limiter na Vercelu je jen
  orientační. Pro produkci s reálným provozem nutné přesunout do DB/KV.
- **GDPR procesy** — hlas je osobní údaj a odchází dalšímu zpracovateli.
  Projekt už má otevřený dluh v retenci a mazání; hlas ho zvětšuje a před
  ostrým provozem vyžaduje doplnění zpracovatelské smlouvy a informací
  pro subjekt údajů.
- **Observabilita hlasu v Langfuse** — trasuje se dál jen textová část přes
  `/api/chat`. Latence a náklady Live session v Langfuse nebudou.
- **Barge-in / hands-free** — fáze 1 je push-to-talk.

---

## Výhled fáze 2 (vědomě odloženo)

Plnohodnotný hlasový agent: konverzaci drží Gemini Live, náš retrieval volá
přes **function calling** (`search_knowledge_base`). UX by bylo výrazně lepší —
přerušování řeči, latence pod sekundu, přirozený dialog. Cena za to je ale
vysoká a rozhoduje se o ní samostatně:

- **Grounding se přesouvá k modelu, na který nemáme evaly.** Celá evaluační
  pipeline (7 datasetů, LLM-judge „Correctness in Czech") měří Claude.
  Bez paralelní sady pro Gemini bys vyměnil měřenou kvalitu za latenci.
- **Třetí zdroj pravdy pro prompt** vedle `prompts.ts` a `app_settings` —
  hlasová varianta potřebuje jiný styl (bez „čl. 29 odst. 8"). Je to přesně
  ten problém, kvůli kterému byla zamítnuta migrace promptů do Langfuse
  Prompt Managementu.
- **Ztráta telemetrie**: Live neteče přes AI SDK, generation span by se musel
  instrumentovat ručně.
- Naopak **bezpečnostně to problém není**: tool by volal naši routu, která si
  `audiences` odvodí serverově ze session — model viditelnosti dokumentů
  (etapa C) drží i tady, protože klient štítky nikdy neposílá.
