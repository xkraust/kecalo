# PRD: PojistBot — RAG chatbot pro pojišťovnu (výukový prototyp)

| | |
|---|---|
| **Verze** | 1.0 |
| **Datum** | 10. 6. 2026 |
| **Status** | Návrh |
| **Účel** | Zadání pro jednodenní kurz vibecodingu |
| **Vlastník** | (doplňte jméno) |

---

## 1. Shrnutí (Executive Summary)

PojistBot je webová aplikace — prototyp AI chatbota pro fiktivní pojišťovnu. Zákazníkům umožňuje v přirozeném jazyce (česky) klást otázky k pojistným produktům a podmínkám a dostávat odpovědi založené výhradně na oficiálních dokumentech pojišťovny. Odpovědi generuje velký jazykový model (LLM) s využitím techniky **RAG (Retrieval-Augmented Generation)**: relevantní pasáže se nejprve vyhledají ve vektorové databázi naplněné firemními dokumenty a teprve na jejich základě model formuluje odpověď.

Aplikace má dvě části:

1. **Zákaznické chatovací rozhraní** — veřejná část, kde uživatel konverzuje s botem.
2. **Administrace znalostní báze** — chráněná část, kde administrátor nahrává zdrojové dokumenty (primárně PDF), spouští jejich zpracování (indexaci) a spravuje obsah znalostní báze.

Jde o **výukový prototyp**, který musí být realisticky postavitelný během jednoho dne vibecodingu jedním vývojářem. Nejde o produkční systém — bezpečnost, škálování a compliance jsou vědomě zjednodušeny (viz kap. 9 a 15).

---

## 2. Kontext a motivace

### 2.1 Problém

Zákazníci pojišťoven se ztrácejí v dlouhých pojistných podmínkách (desítky stran právního textu). Odpovědi na běžné otázky („Kryje moje cestovní pojištění zrušení letu?“, „Jaká je spoluúčast u havarijního pojištění?“) jsou v dokumentech obtížně dohledatelné, což zatěžuje call centrum a frustruje zákazníky.

### 2.2 Řešení

Chatbot s technologií RAG, který odpovídá **pouze na základě nahraných dokumentů** a u každé odpovědi uvádí zdroj (název dokumentu, případně stranu/sekci). Tím se minimalizují halucinace a odpovědi jsou auditovatelné.

### 2.3 Kontext kurzu

Aplikace vzniká jako demonstrační projekt jednodenního kurzu vibecodingu. PRD slouží zároveň jako:
- zadání pro AI kódovacího asistenta (Claude Code apod.),
- osnova pro účastníky, jak se podobný projekt strukturuje,
- checklist pro ověření, že prototyp splňuje cíle dne.

### 2.4 Cíle

| ID | Cíl | Měřítko úspěchu |
|---|---|---|
| C1 | Funkční end-to-end RAG pipeline | Otázka → vyhledání → odpověď s citací zdroje funguje na demo datech |
| C2 | Admin umí naplnit znalostní bázi bez zásahu do kódu | Nahrání PDF přes UI → dokument je do 1 min dotazovatelný |
| C3 | Bot neodpovídá mimo znalostní bázi | Na otázku mimo dokumenty odpoví „nevím / kontaktujte pojišťovnu“ |
| C4 | Stihnutelné za 1 den | MVP rozsah (kap. 5) hotový do konce kurzu |

### 2.5 Ne-cíle (Out of scope pro MVP)

- Sjednávání či správa pojistných smluv, práce s osobními daty klientů
- Vícejazyčnost (pouze čeština; LLM si poradí, ale netestujeme)
- Produkční autentizace (SSO, role), GDPR procesy, audit logy
- Eskalace na živého operátora, integrace na CRM/core systémy
- Mobilní aplikace (web je responzivní, to stačí)
- Hodnocení kvality odpovědí (RAG evals) — pouze zmínit jako rozšíření

---

## 3. Persony

### P1 — Zákazník „Jana“
Klientka pojišťovny, 38 let, řeší cestovní pojištění před dovolenou. Nechce číst 40 stran podmínek, chce rychlou a důvěryhodnou odpověď s odkazem, kde si ji ověří. Technicky běžný uživatel — očekává rozhraní typu ChatGPT/messenger.

### P2 — Administrátor „Petr“
Pracovník produktového oddělení pojišťovny. Není vývojář. Potřebuje jednoduché rozhraní, kam nahraje aktuální pojistné podmínky a produktové listy, vidí, co je v bázi, a umí zastaralý dokument smazat.

### P3 — Vývojář / lektor (vy)
Staví a předvádí prototyp. Potřebuje, aby šel projekt spustit lokálně jedním příkazem, měl čitelný kód a jasně oddělené vrstvy (UI / API / RAG pipeline), aby se na něm dalo učit.

---

## 4. User stories a akceptační kritéria

Prioritizace metodou MoSCoW: **M** = Must have (MVP), **S** = Should have, **C** = Could have (čas dovolí), **W** = Won't have (mimo rozsah).

### 4.1 Zákaznická část (chat)

**US-01 (M) — Položení otázky**
*Jako zákazník chci napsat otázku do chatu a dostat odpověď v češtině, abych nemusel číst pojistné podmínky.*
- Akceptační kritéria:
  - Vstupní pole + odeslání klávesou Enter i tlačítkem.
  - Odpověď se zobrazí v konverzačním vlákně (bubliny uživatel/bot).
  - Během generování je vidět indikátor načítání; ideálně streamování odpovědi po tokenech.
  - Odpověď dorazí typicky do ~10 s.

**US-02 (M) — Odpověď se zdrojem**
*Jako zákazník chci u odpovědi vidět, z jakého dokumentu vychází, abych jí mohl věřit a ověřit si ji.*
- Akceptační kritéria:
  - Pod odpovědí je seznam použitých zdrojů: název dokumentu + identifikace části (strana / sekce / pořadí chunku).
  - Zdroje odpovídají skutečně použitým chunkům z retrievalu (ne vymyšlené).

**US-03 (M) — Otázka mimo znalostní bázi**
*Jako zákazník chci dostat férovou odpověď „nevím“, pokud se ptám na něco, co v dokumentech není, abych nedostal vymyšlenou informaci.*
- Akceptační kritéria:
  - Pokud retrieval nevrátí dostatečně relevantní pasáže (práh similarity) nebo LLM nenajde odpověď v kontextu, bot odpoví předdefinovaným sdělením typu: „Na tuto otázku v dostupných podmínkách nenacházím odpověď. Obraťte se prosím na infolinku XXX.“
  - Bot v takovém případě nic nefabuluje a neradí „z hlavy“.

**US-04 (M) — Kontext konverzace**
*Jako zákazník chci pokládat navazující otázky („A co když cestuju s dětmi?“), aby konverzace působila přirozeně.*
- Akceptační kritéria:
  - Historie aktuální konverzace se posílá modelu (postačí posledních ~6–10 zpráv).
  - Navazující dotaz se před retrievalem přeformuluje na samostatný dotaz (query rewriting), NEBO se do retrievalu posílá dotaz obohacený o kontext. (Zvolte jednodušší variantu, stačí jedna.)

**US-05 (S) — Nová konverzace**
*Jako zákazník chci jedním klikem začít novou konverzaci.*
- Akceptační kritéria: tlačítko „Nová konverzace“ vymaže vlákno i kontext. Persistování historie mezi sezeními není nutné (in-memory / state na klientu stačí).

**US-06 (S) — Navrhované otázky**
*Jako zákazník chci na úvodní obrazovce vidět 3–4 ukázkové otázky, abych věděl, co se můžu ptát.*
- Akceptační kritéria: kliknutí na ukázkovou otázku ji odešle do chatu. Otázky mohou být v MVP zadané natvrdo v konfiguraci.

**US-07 (C) — Disclaimer**
*Jako pojišťovna chci, aby u chatu byl viditelný disclaimer, že odpovědi jsou informativní a nejsou právně závazné.*
- Akceptační kritéria: statický text v patičce chatu.

### 4.2 Administrace

**US-10 (M) — Přihlášení do administrace**
*Jako administrátor chci, aby admin část nebyla veřejně přístupná.*
- Akceptační kritéria:
  - Admin sekce (`/admin`) je chráněna minimálně sdíleným heslem / HTTP Basic auth / jednoduchým loginem (heslo v env proměnné). Plnohodnotná správa uživatelů není v MVP potřeba.

**US-11 (M) — Nahrání dokumentu**
*Jako administrátor chci nahrát PDF soubor s pojistnými podmínkami, aby z něj bot uměl odpovídat.*
- Akceptační kritéria:
  - Upload přes drag & drop nebo výběr souboru; podporované formáty pro MVP: **PDF, TXT, MD** (DOCX = Should have).
  - Limit velikosti (např. 20 MB) a validace typu souboru s čitelnou chybovou hláškou.
  - Po nahrání se automaticky spustí indexace: extrakce textu → rozdělení na chunky → výpočet embeddingů → uložení do vektorové DB.
  - UI zobrazuje stav zpracování: `Nahráno → Zpracovává se → Hotovo / Chyba`.

**US-12 (M) — Přehled dokumentů**
*Jako administrátor chci vidět seznam všech dokumentů ve znalostní bázi.*
- Akceptační kritéria:
  - Tabulka: název souboru, formát, datum nahrání, počet chunků, stav.
  - Seznam se aktualizuje po dokončení indexace (polling nebo refresh stačí).

**US-13 (M) — Smazání dokumentu**
*Jako administrátor chci dokument smazat, aby bot nečerpal ze zastaralých podmínek.*
- Akceptační kritéria:
  - Smazání odstraní soubor, metadata i všechny jeho chunky/embeddingy z vektorové DB.
  - Potvrzovací dialog před smazáním.
  - Po smazání bot z dokumentu prokazatelně neodpovídá.

**US-14 (S) — Testovací dotaz v adminu**
*Jako administrátor chci v adminu položit testovací dotaz a vidět, které chunky retrieval vrátil (včetně skóre), abych ověřil kvalitu indexace.*
- Akceptační kritéria: pole pro dotaz + výpis top-k chunků s textem, zdrojem a similarity skóre. (Skvělé i pro výuku — zviditelňuje „vnitřnosti“ RAGu.)

**US-15 (C) — Re-indexace**
*Jako administrátor chci dokument přeindexovat (např. po změně parametrů chunkování).*

### 4.3 Systémové story

**US-20 (M) — RAG pipeline**
*Jako systém chci pro každý dotaz: (1) spočítat embedding dotazu, (2) najít top-k nejpodobnějších chunků, (3) sestavit prompt s kontextem a instrukcemi, (4) zavolat LLM, (5) vrátit odpověď + metadata zdrojů.*
- Akceptační kritéria:
  - top-k konfigurovatelné (default 5), práh similarity konfigurovatelný.
  - Systémový prompt vynucuje: odpovídej jen z kontextu, česky, stručně, cituj zdroje, při nejistotě řekni nevím.

**US-21 (M) — Konfigurace přes env**
*Jako vývojář chci API klíče a parametry (model, top-k, chunk size) v `.env`, abych nic necommitoval do repa.*

**US-22 (S) — Ošetření chyb**
*Jako systém chci čitelně ošetřit chyby (výpadek LLM API, rate limit, nečitelné PDF) tak, aby UI zobrazilo srozumitelnou hlášku a aplikace nespadla.*

---

## 5. Rozsah MVP (co musí být na konci dne hotové)

1. Chat UI se streamovanou odpovědí, zdroji a fallbackem „nevím“ (US-01, 02, 03, 04).
2. Admin chráněný heslem: upload PDF/TXT/MD, seznam dokumentů, smazání (US-10–13).
3. Funkční RAG pipeline s konfigurací přes env (US-20, 21).
4. Seed data: 2–3 ukázkové dokumenty fiktivní pojišťovny (např. „Pojistné podmínky — cestovní pojištění“, „Produktový list — havarijní pojištění“) připravené předem, ať se demo nestaví na prázdné bázi.

Vše ostatní (S/C) je bonus podle tempa kurzu.

---

## 6. Návrh technologického stacku

Doporučení optimalizované na rychlost vývoje v jednom dni, jednoho vývojáře a dobrou podporu ze strany AI kódovacích asistentů.

### 6.1 Doporučený stack (varianta A — „vše v Next.js“)

| Vrstva | Technologie | Zdůvodnění |
|---|---|---|
| Full-stack framework | **Next.js 15 (App Router) + TypeScript** | Frontend i backend (API routes) v jednom projektu; nejlépe „vibecodovatelný“ stack — AI asistenti ho znají nejlépe. |
| UI | **Tailwind CSS + shadcn/ui** | Rychlé, hezké výchozí komponenty (chat, tabulky, dialogy, upload). |
| AI orchestrace | **Vercel AI SDK** | Hotové streamování chatu (`useChat`), abstrakce nad providery. |
| LLM (generování) | **Claude API — `claude-sonnet-4-6`** | Velmi dobrá čeština, spolehlivé držení instrukcí („odpovídej jen z kontextu“); pro lacinější provoz lze přepnout na `claude-haiku-4-5`. |
| Embeddingy | **Voyage AI (`voyage-3.5`, dimenze 1024)** | Anthropic vlastní embedding API nemá a Voyage doporučuje; free tier stačí na celý kurz, výpočet běží v cloudu (nezávislé na výkonu notebooku). Klíče v `.env`: `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`. Nouzový fallback při výpadku konektivity: lokální model přes Transformers.js (`multilingual-e5-small`, dimenze 384 — vyžaduje úpravu schématu). |
| Vektorová DB | **Supabase (Postgres + pgvector)** | Free tier, hostovaná (nic se neinstaluje), zároveň poslouží jako běžná DB pro metadata dokumentů; SQL je pro výuku čitelné. |
| Úložiště souborů | Supabase Storage (nebo lokální `/uploads` adresář) | Originály PDF pro download/audit. |
| Parsování PDF | **`unpdf`** nebo `pdf-parse` (npm) | Čistě JS extrakce textu, bez systémových závislostí. |
| Chunking | Vlastní jednoduchý splitter (např. ~800–1000 tokenů, overlap ~150) | Pár řádků kódu; pro výuku lepší než černá skříňka. |
| Repozitář / verzování | **GitHub** | Zdroj pravdy pro kód; commit po každém milníku kurzu = záchranné body. |
| Hosting / deploy | **Vercel propojený s GitHubem** | Každý push do `main` automaticky nasadí novou verzi (CI/CD). Pozn.: GitHub Pages nelze použít — hostuje jen statické weby, aplikace vyžaduje backend (API klíče, RAG pipeline). |

### 6.2 Alternativa (varianta B — Python)

FastAPI + LangChain (loaders, splittery, retrieval) + ChromaDB (lokální, bez registrace) + jednoduchý React/Vite frontend nebo Streamlit. Vhodné, pokud byste chtěl demonstrovat Python ekosystém; pro jednodenní full-stack demo je ale varianta A plynulejší (jeden jazyk, jeden repozitář, hotové streamování).

**Doporučení: varianta A.**

### 6.3 Klíčové parametry RAG (výchozí hodnoty)

| Parametr | Default | Pozn. |
|---|---|---|
| Chunk size | ~900 tokenů | Pojistné podmínky mají dlouhé článkované odstavce |
| Chunk overlap | 150 tokenů | |
| Top-k | 5 | |
| Similarity threshold | 0,3–0,4 (cosine) | Pod práh → fallback „nevím“; dolaďte na datech |
| Max. kontext do promptu | ~6 000 tokenů | |
| Teplota LLM | 0–0,3 | Faktické odpovědi |

---

## 7. Architektura

```
┌──────────────────────────── Next.js aplikace ────────────────────────────┐
│                                                                          │
│  /            Chat UI (useChat, streamování, zdroje, disclaimer)         │
│  /admin       Admin UI (login, upload, seznam dokumentů, test retrieval) │
│                                                                          │
│  API routes:                                                             │
│   POST /api/chat          → RAG pipeline → stream odpovědi + zdroje      │
│   POST /api/documents     → upload → extrakce → chunking → embeddingy    │
│   GET  /api/documents     → seznam dokumentů + stav                      │
│   DELETE /api/documents/:id → smazání souboru + chunků                   │
│   POST /api/retrieval-test  → top-k chunků pro dotaz (admin, US-14)      │
└───────────────┬───────────────────────────┬──────────────────────────────┘
                │                           │
        Claude API (generování)      Voyage AI API (embeddingy)
                │                           │
                └────────────┬──────────────┘
                             ▼
              Supabase: Postgres + pgvector + Storage
              (documents, chunks s embeddingy, originály souborů)
```

### 7.1 Tok dotazu (chat)

1. Klient pošle zprávu + historii konverzace na `POST /api/chat`.
2. Server (volitelně) přepíše navazující dotaz na samostatný.
3. Embedding dotazu → vektorové vyhledání top-k chunků (pgvector, cosine).
4. Pokud nejlepší skóre < práh → vrátit fallback odpověď, konec.
5. Sestavení promptu: systémové instrukce + nalezené chunky (s označením zdroje) + historie + dotaz.
6. Volání Claude API se streamováním; klient zobrazuje odpověď průběžně.
7. Po dokončení se k odpovědi připojí metadata zdrojů (název dokumentu, strana/chunk).

### 7.2 Tok indexace (admin)

Upload → uložení originálu → extrakce textu (po stránkách, kvůli citacím) → chunking s overlapem → batch výpočet embeddingů → uložení chunků s metadaty (`document_id`, `page`, `chunk_index`) → stav dokumentu `Hotovo`.

---

## 8. Datový model (zjednodušený)

Schéma se vytváří a udržuje výhradně přes SQL migrace v `supabase/migrations/` (viz kap. 9 — Udržovatelnost), ne ručními zásahy v SQL editoru.

```sql
documents (
  id uuid PK,
  filename text,
  mime_type text,
  status text,            -- uploaded | processing | ready | error
  error_message text NULL,
  chunk_count int,
  created_at timestamptz
)

chunks (
  id uuid PK,
  document_id uuid FK → documents (ON DELETE CASCADE),
  chunk_index int,
  page int NULL,
  content text,
  embedding vector(1024)  -- dimenze modelu voyage-3.5
)
-- + ivfflat/hnsw index nad embedding pro rychlé vyhledávání
```

---

## 9. Nefunkční požadavky

| Oblast | Požadavek (úroveň prototypu) |
|---|---|
| Výkon | Odpověď chatu start streamu < 5 s; indexace 30stránkového PDF < 60 s |
| Použitelnost | Responzivní (desktop i mobil), čeština v celém UI |
| Bezpečnost | API klíče pouze na serveru (.env, nikdy na klientu); admin za heslem; validace uploadů (typ, velikost). Vědomě mimo rozsah: rate limiting, RLS, šifrování at rest, GDPR procesy — v PRD pouze uvést jako produkční dluh |
| Obsahová bezpečnost | Systémový prompt zakazuje právní/finanční poradenství nad rámec dokumentů; disclaimer v UI |
| Spolehlivost | Chyby externích API nesmí shodit aplikaci; stav `error` u dokumentu s důvodem |
| Udržovatelnost | Oddělená vrstva RAG logiky (`lib/rag/*`), konfigurace v env, README s postupem spuštění; kód verzován na GitHubu (`.env` v `.gitignore`, v repu pouze `.env.example`); veškeré změny DB schématu formou SQL migračních souborů (`supabase/migrations/`), aby bylo schéma verzované a reprodukovatelné |
| Nasazení | Automatický deploy z GitHubu na Vercel (push do `main` → produkce); env proměnné nastavené ve Vercel projektu, nikdy v repozitáři |
| Náklady | Demo provoz v řádu jednotek USD (Haiku/Sonnet + levné embeddingy); Supabase a Vercel free tier |

---

## 10. UI/UX požadavky

### 10.1 Chat (`/`)
- Hlavička s logem/názvem fiktivní pojišťovny (např. „Pojišťovna Jistota“).
- Uvítací zpráva bota + 3–4 klikatelné ukázkové otázky (US-06).
- Konverzační vlákno: bubliny, autor, čas; odpovědi bota renderovat jako Markdown.
- Blok „Zdroje“ pod odpovědí: rozklikávací seznam (název dokumentu, strana).
- Vstupní řádek dole, disabled během generování; tlačítko Nová konverzace.
- Patička s disclaimerem.

### 10.2 Admin (`/admin`)
- Jednoduchý login (heslo).
- Karta Upload: drag & drop zóna, podporované formáty, progress.
- Tabulka dokumentů: název, datum, počet chunků, stav (badge), akce Smazat.
- (S) Panel „Test retrievalu“: dotaz → výpis chunků se skóre.

---

## 11. Systémový prompt bota (výchozí znění, k doladění)

> Jsi asistent pojišťovny Jistota. Odpovídáš výhradně na základě poskytnutých úryvků z oficiálních dokumentů (kontext níže). Pravidla: (1) Pokud odpověď v kontextu není, řekni to otevřeně a odkaž na infolinku 800 123 456 — nikdy si nedomýšlej. (2) Odpovídej česky, stručně a srozumitelně, bez právního žargonu, ale věcně přesně. (3) U každé odpovědi uveď, ze kterého dokumentu čerpáš. (4) Neposkytuj právní ani finanční poradenství nad rámec citovaných podmínek a nesjednávej žádné produkty. (5) Na otázky nesouvisející s pojištěním zdvořile odpověz, že pomáháš pouze s dotazy k produktům pojišťovny.

---

## 12. Plán dne (orientační harmonogram kurzu)

| Blok | Čas | Obsah | Milník |
|---|---|---|---|
| 1 | 0:00–0:45 | Úvod, PRD, založení projektu (Next.js, shadcn, Supabase, env) + GitHub repo a propojení s Vercelem. Předpoklad: prerekvizity z kap. 18 splněny předem | Projekt běží lokálně, první push na GitHub |
| 2 | 0:45–2:00 | Datový model + admin upload + extrakce PDF | Dokument se uloží a vypíše v tabulce |
| 3 | 2:00–3:15 | Chunking + embeddingy + zápis do pgvector | US-11/12 hotové, test retrievalu vrací chunky |
| 4 | 3:15–4:30 | Chat API: retrieval → prompt → Claude → stream | První RAG odpověď v terminálu/UI |
| 5 | 4:30–5:30 | Chat UI: vlákno, zdroje, fallback „nevím“, ukázkové otázky | MVP demo end-to-end |
| 6 | 5:30–6:30 | Mazání dokumentů, ošetření chyb, ladění promptu a prahů | MVP kompletní |
| 7 | 6:30–7:00 | Bonusy (test retrievalu v adminu, deploy na Vercel), Q&A | Veřejné demo |

---

## 13. Metriky úspěchu (pro účely kurzu)

- Demo scénář projde bez chyby: nahrání PDF → otázka na obsah → správná odpověď se zdrojem → otázka mimo bázi → fallback → smazání dokumentu → bot už neodpovídá.
- 8 z 10 testovacích otázek na seed dokumenty zodpovězeno věcně správně se správným zdrojem.
- 0 případů, kdy bot odpoví fakticky mimo nahrané dokumenty.

---

## 14. Rizika a mitigace

| Riziko | Dopad | Mitigace |
|---|---|---|
| PDF s komplikovaným layoutem (tabulky, sloupce) se špatně extrahuje | Špatné chunky → špatné odpovědi | Připravit seed PDF s jednoduchým layoutem; TXT/MD jako záložní formát |
| Nedostatek času na kurzu | Nestihne se MVP | Striktní MoSCoW; bloky 6–7 jsou obětovatelné; mít připravený záložní commit po každém milníku |
| Slabý retrieval na češtině | Irelevantní chunky | Volit multilingvální embedding model (Voyage / OpenAI obstojí); ladit chunk size a top-k v admin test panelu |
| Halucinace LLM | Ztráta důvěryhodnosti dema | Nízká teplota, striktní systémový prompt, similarity práh + fallback |
| Rate limity / výpadek API | Demo se zasekne | Ošetřené chyby s retry hláškou; záložní API klíč |
| Výpadek konektivity v místě kurzu | Embeddingy (Voyage) nedostupné | Nouzový fallback: lokální embeddingy přes Transformers.js (`multilingual-e5-small`); pozor — jiná dimenze (384) vyžaduje úpravu sloupce `embedding` a kompletní re-indexaci; pomalejší na slabším HW, proto jen jako záloha |
| Velká PDF → dlouhá indexace | Čekání na kurzu | Limit velikosti, batchování embeddingů, seed data předem |

---

## 15. Produkční dluh (co by se muselo dořešit mimo prototyp)

Autentizace a role (admin vs. editor), GDPR a retence konverzací, rate limiting a ochrana proti prompt injection z nahraných dokumentů, evaluace kvality RAG (golden dataset otázek), verzování dokumentů a platnost podmínek v čase, eskalace na operátora, monitoring nákladů a latence, podpora DOCX/HTML/skenovaných PDF (OCR).

---

## 16. Otevřené otázky

1. Finální seznam podporovaných formátů nad rámec PDF/TXT/MD (DOCX? HTML?).
2. Mají se konverzace ukládat (analytika) — pro MVP navrženo NE.
3. Název a branding fiktivní pojišťovny pro demo.
4. Hostovaná vektorová DB (Supabase) vs. čistě lokální běh bez registrace (pgvector v Dockeru / SQLite + sqlite-vec) — záleží na konektivitě v místě kurzu.

---

## 17. Přílohy — návrh seed dat

Připravit předem 2–3 fiktivní dokumenty (vygenerovat lze pomocí LLM):
1. *Všeobecné pojistné podmínky — cestovní pojištění* (limity plnění, výluky, spoluúčast, asistenční služby) — ~10 stran.
2. *Produktový list — havarijní pojištění AutoJistota* (varianty krytí, spoluúčast, územní platnost) — ~3 strany.
3. *FAQ — pojištění domácnosti* — ~2 strany.

K nim sadu ~10 testovacích otázek včetně 2 otázek záměrně mimo znalostní bázi (test fallbacku).

---

## 18. Checklist před zahájením vývoje (prerekvizity)

Vše níže provést **před kurzem** — na místě se už jen vyvíjí. Odhad celkového času: ~45 minut.

### 18.1 Účty a registrace (vše free tier)

| # | Služba | URL | K čemu | Stav |
|---|---|---|---|---|
| 1 | GitHub | github.com | Repozitář kódu | ☐ (mám) |
| 2 | Anthropic Console | console.anthropic.com | Claude API (generování odpovědí) | ☐ (mám) |
| 3 | Voyage AI | voyageai.com | Embedding API | ☐ |
| 4 | Supabase | supabase.com | Postgres + pgvector + Storage | ☐ |
| 5 | Vercel | vercel.com | Hosting/deploy (přihlásit se GitHub účtem — propojí se samo) | ☐ |

### 18.2 Klíče a přístupy k vygenerování

| Proměnná v `.env` | Kde získat | Pozn. |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys | Ověřit, že je na účtu kredit |
| `VOYAGE_API_KEY` | Voyage AI dashboard → API Keys | Free tier stačí |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | URL projektu (může být veřejná) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | ⚠️ Pouze server, nikdy na klienta ani do Gitu |
| `DATABASE_URL` | Supabase → Connect → connection string | Pro migrace (Supabase CLI / psql) |
| `ADMIN_PASSWORD` | Zvolit vlastní | Ochrana `/admin` sekce |

Do repozitáře commitnout pouze `.env.example` se seznamem proměnných bez hodnot.

### 18.3 Kroky k provedení

1. **Supabase**: založit nový projekt (region EU), poznamenat si heslo k DB. Rozšíření pgvector a tabulky NEvytvářet ručně — vznikne migracemi během vývoje.
2. **GitHub**: založit prázdný privátní/veřejný repozitář pro projekt.
3. **Vercel**: přihlásit se přes GitHub (samotné propojení s repozitářem proběhne v bloku 1 kurzu).
4. **Anthropic**: ověřit funkčnost klíče a kredit (např. testovací request ve Workbench v Console).
5. **Seed data**: připravit 2–3 fiktivní dokumenty a ~10 testovacích otázek dle kap. 17.
6. Připravit lokální soubor `.env` se všemi hodnotami z 18.2 (mimo repozitář).

### 18.4 Lokální nástroje na notebooku

| Nástroj | Verze | Ověření |
|---|---|---|
| Node.js | LTS (20+) | `node -v` |
| Git | aktuální | `git --version` |
| Claude Code | aktuální | `claude --version`; přihlášen k Anthropic účtu |
| Supabase CLI | aktuální | `supabase --version` (pro migrace) |

### 18.5 Smoke test (doporučeno den předem)

Krátkým skriptem nebo přes curl ověřit, že odpovídá: (a) Claude API, (b) Voyage API, (c) připojení k Supabase DB přes `DATABASE_URL`. Pět minut, které na kurzu ušetří hodinu debugování konektivity.
