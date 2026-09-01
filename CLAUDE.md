# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Pracovní postup

**Komunikace:** s uživatelem si tykáme — používej neformální tón („ty"), ne vykání.

Po dokončení každého kroku v rámci libovolné fáze implementace (viz `docs/IMPLEMENTATION_PLAN.md`) aktualizuj tento soubor CLAUDE.md — doplň nebo oprav sekce, které daný krok ovlivnil. CLAUDE.md musí vždy odrážet aktuální stav projektu, stejně tak aktualizuj implementační plán (`docs/IMPLEMENTATION_PLAN.md`), zaškrtni všechny kroky, které jsou hotové. Změny architektury (nové API routy, tabulky, moduly, změny pipeline či bezpečnostního modelu) promítni i do technického popisu `docs/ARCHITECTURE.md`. Pokud při implemntaci vznikne potřeba implementační plán doplnit či pozměnit, oznam tuto skutečnost uživateli, navrhni změnu a počkej na souhlas. Po dokončení každé fáze nebo vetšího kroku se zeptej, zda se má provést push a commit.

## Stav projektu

Fáze 0–17 jsou **hotové a ověřené end-to-end** (poslední: Fáze 17 — správa promptů v adminu: system prompt chatu a prompt shrnutí poptávek editovatelné za běhu v `/admin/parameters/prompts`, NULL = výchozí z kódu; migrace `013_prompt_settings.sql` aplikovaná. Fáze 16 — zpětná vazba u odpovědi: palec nahoru poděkování, palec dolů karta kontaktu → lead typu `hodnoceni`; migrace `012_lead_type.sql` aplikovaná. Fáze 15 — evaluace přes Langfuse datasety, eval runner `scripts/langfuse-eval.mjs` a LLM-as-judge „Correctness in Czech" nakonfigurovaný v Langfuse UI; šablona Faithfulness zatím nejde — trace nenese obsah chunků, `record_content` default off). Hotové a ověřené jsou i všechny opravy z revize kódu (`docs/reviews/code_check.md`, 15 nálezů, balíčky A–E dle `docs/reviews/issues_correction_plan.md`) a z bezpečnostní revize (`docs/reviews/security_issues.md`, SEC-1 až SEC-6 + SEC-9 + SEC-10, balíčky A–F dle `docs/reviews/security_correction_plan.md`; následně i SEC-4 — server-side revokace session). SEC-7 a SEC-8 (serverová historie chatu, CSRF token) zůstávají vědomě odložené jako produkční dluh. Migrace `001`–`018` jsou aplikované na Supabase. Pozn.: `004`–`013` byly kdysi aplikované ručně mimo CLI, takže je bylo nutné doevidovat přes `supabase migration repair --status applied` — od `014` je historie srovnaná a `supabase db push` funguje normálně.

Zbývá z ladění RAG: `Informace pro klienta.pdf` není v DB nahraná (uživatel nahraje přes admin UI) a fallback otázky mimo bázi dál vracejí chunky nad prahem 0,35 (čisté odmítnutí zajišťuje systémový prompt; případně zvýšit práh v `/admin/parameters`).

**Probíhající experiment (mimo číslované fáze):** shrnutí poptávek přepnuto z Claude Haiku na Mistral model (`mistral-small-latest` přes `@ai-sdk/mistral`) — prototypový test levnějšího modelu, Varianta B dle `docs/plans/mistral_summary_experiment_plan.md`. **Hotové a E2E ověřené** (13. 7. 2026): happy-path vrací věcné české shrnutí, SEC-9 injection drží, v Langfuse zachován generation span s modelem `mistral-small-latest` a tokeny (cena = 0, dokud se model nedefinuje v Langfuse — stejné jako `voyage-3.5`). Telemetrie beze změny (generation span dál z AI SDK, protože `@ai-sdk/mistral` je provider Vercel AI SDK). Chat, RAG i retrieval zůstávají na Claude/Anthropicu. `MISTRAL_API_KEY` je nasazený i na Vercel Project env. Volitelně zbývá jen definovat `mistral-small-latest` v Langfuse Settings → Models kvůli výpočtu ceny.

**Widget mini Kecalo (mimo číslované fáze):** vysouvací chat widget v rohu obrazovky (bublina → panel) na nové demo stránce `/demo`, která simuluje web „Pojišťovny Jistota" — dle `docs/plans/widget_mini_kecalo_plan.md`. **Hotové a E2E ověřené** (14. 7. 2026): chatová logika vytažena do sdíleného hooku `useKecaloChat()` a komponenty `ChatMessages` (fullscreen `/` beze změny chování), nová komponenta `ChatWidget` (panel vždy namountovaný — konverzace i běžící stream přežijí minimalizaci). Ověřeno stream/zdroje/karta poptávky (obě varianty)/persistence/mobilní šířka/konzole bez chyb. Žádná nová API routa ani útočná plocha — widget používá jen existující veřejné routy. Fáze 2 (embeddovatelný widget na cizí web přes `/widget` + `public/embed.js`) zůstává vědomě neimplementovaná.

**Headless Langfuse (mimo číslované fáze):** ovládání Langfuse z coding agenta (agent skill + CLI) místo z UI, plus doplnění dat, bez kterých je taková smyčka slepá. **Etapy 1–4 hotové a ověřené** (4. 8. 2026): skill nainstalován globálně (mimo repo), traces dostaly jméno `chat-rag` a `langfuse.session.id`, `/api/chat` vrací `X-Trace-Id`, palec nahoru/dolů se ukládá jako skóre `user-thumbs` (`BOOLEAN`, idempotentní, fail-open) a trace nese `prompt_hash`/`prompt_source`. Tím jsou poprvé v Langfuse **produkční skóre** — kvalita jde měřit i mimo eval datasety. Migrace promptů do Langfuse Prompt Managementu **vědomě zamítnuta** (třetí zdroj pravdy vedle `prompts.ts` a `app_settings`, runtime závislost, kolize s Fází 17) — nahrazena otiskem verze promptu. Zbývá **etapa 5** (dataset z reálných traces s palcem dolů) — čeká na nasbíraný provoz a na rozhodnutí, zda `record_content` v produkci zůstane zapnutý (GDPR). Detaily: `docs/IMPLEMENTATION_PLAN.md`, dluh v `docs/plans/LANGFUSE_PLAN.md`.

**Role a přístup k dokumentům (mimo číslované fáze):** třívrstvý model oprávnění dle `docs/plans/roles_and_document_access_plan.md` — aplikační role (co smíš dělat), pracovní role sdružující štítky (kdo jsi v organizaci) a štítky dokumentů (komu obsah patří). **Všechny etapy A–D hotové a E2E ověřené** (A–C 31. 8. 2026, D 1. 9. 2026): tabulka `users` (migrace `014`), scrypt hesla, session cookie v2 s `uid`, `requireAppRole` v 8 handlerech, per-user revokace session, seed skript, per-username rate limit. Build/lint/typecheck procházejí, migrace `014` je aplikovaná a první uživatel seednutý. Ověřeno: cookie v1 odmítnuta, `viewer` dostane 403 na admin routách, **logout jednoho uživatele neodhlásí ostatní**, deaktivace účtu ukončí session, per-username rate limit drží napříč IP. Etapa B přidala správu uživatelů v `/admin/users` (zakládání s vygenerovaným heslem, reset, deaktivace, změna role), vynucenou změnu iniciálního hesla (`must_change_password`, migrace `015`) a samoobslužnou změnu hesla na `/admin/change-password`. Etapa C přidala **pracovní role a štítky dokumentů** (migrace `016`): číselníky v `/admin/users/job-roles` a `/admin/users/audiences`, viditelnost dokumentů (`public`/`restricted` + štítky), filtr v `match_chunks` a přepínač provozního režimu `default_document_visibility`. Etapa D přidala **přihlášení přes firemní identity provider** (OIDC, `openid-client` v6, bez migrace): `/api/auth/oidc/start` a `/callback`, JIT provisioning účtu při prvním přihlášení, mapování skupin z claims na pracovní role přes `job_roles.external_group`. Postup nasazení (registrace aplikace u IdP, env, mapování skupin, řešení problémů) je v `docs/sso-setup.md`. Stav konfigurace ukazuje adminovi indikátor `SsoStatus` — v patičce sidebaru kompaktně, na `/admin/users` s vysvětlením; při neúplné konfiguraci vypíše **názvy** chybějících proměnných (nikdy hodnoty), protože `oidcConfig()` vrací null už při jedné chybějící a zapomenutý secret by jinak vypadal jako úplně vypnuté SSO. Mapování skupiny na roli se nastavuje polem **Skupina v IdP** v `/admin/users/job-roles` (migrace `017` hlídá, aby jedna skupina mapovala nejvýš na jednu roli). Ověřeno proti lokálnímu mock IdP (`scripts/mock-idp.mjs`) — **napojení na reálný tenant zbývá** (stačí doplnit env, kód se nemění).

Podrobná historie fází, měření a průběžný stav: `docs/IMPLEMENTATION_PLAN.md`.

## Projekt

**Kecalo** je RAG chatbot pro pojišťovnu. Vznikl jako projekt jednodenního kurzu vibecodingu, ale rozsahem ho dávno přerostl — dnes je v **předprodukční fázi**: funkční aplikace s observabilitou, evaluační pipeline a prošlou bezpečnostní revizí, které do ostrého provozu chybí především dokončení autentizace (etapy A a B plánu rolí zavedly víc identit s aplikačními rolemi a správu uživatelů; zbývá SSO a řízení viditelnosti dokumentů), automatizované testy (žádné — ověřuje se manuálně) a GDPR procesy (retence, mazání). V UI vystupuje jako „Pojišťovna Jistota", znalostní báze ale čerpá z reálných dokumentů Kooperativy ze složky `docs/seed-docs/`. Uživatelé kladou otázky česky k pojistným produktům; bot odpovídá výhradně z indexovaných dokumentů a vždy uvádí zdroj.

## Technologický stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript, adresářová struktura se `src/`
- **UI:** Tailwind CSS v4 (konfigurace přes `@theme` v `globals.css`, bez `tailwind.config.ts`) + shadcn/ui
- **AI orchestrace:** Vercel AI SDK (`useChat`, streamování)
- **LLM:** Claude API — `claude-sonnet-4-6` (chat); shrnutí poptávek běží přes Mistral `mistral-small-latest` (`@ai-sdk/mistral`) — prototypový test levnějšího modelu (Varianta B, viz `docs/plans/mistral_summary_experiment_plan.md`)
- **Embeddingy:** Voyage AI — `voyage-3.5` (1024 dimenzí)
- **Vektorová DB + úložiště:** Supabase (Postgres + rozšíření pgvector + Storage)
- **Parsování PDF:** `unpdf`

## Vzhled a design

UI vychází vizuálně z Anthropic Console (`platform.claude.com`). Výchozí režim je **světlý**, bez tmavého přepínače.

- **Admin (`/admin`)** — přesně ve stylu Console: levý sidebar (Přehled · Dokumenty · Poptávky · Test retrievalu · Parametry · Uživatelé* · Chat · Odhlásit; * jen pro aplikační roli admin), krémové pozadí, korálový akcent, čisté white karty. Úvodní strana `/admin` je dashboard s přehledem znalostní báze (metrické karty + grafy).
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
npm run eval         # eval runner (Langfuse experiment nad datasety) — viz Evaluace
```

### Evaluace (Langfuse experimenty)

```bash
npm run eval                                   # všech 7 datasetů → experiment eval-<timestamp>
node scripts/langfuse-eval.mjs --limit=3 --dry # 3 otázky, bez zápisu do Langfuse (jen výpis)
node scripts/langfuse-eval.mjs --dataset=M-100 --run=baseline
node scripts/langfuse-eval.mjs --only=out_of_scope
```

`scripts/langfuse-eval.mjs` (Node ESM) prožene testovací otázky z Langfuse datasetů (výchozí sada `kecalo/obecne`/`M-100`/`M-200`/`dataset_RENTA_PROFIT`/`dataset_cestovni_M-750`/`dataset_FLEXI`/`dataset_skupinove`, přepínatelné přes `--dataset=`) nasazeným `/api/chat` (`KECALO_BASE_URL`, default Vercel), založí **experiment** přes SDK `@langfuse/client` (`experiment.run`) a připojí deterministická skóre (`fallback_correct`/`retrieved`/`doc_match`/`article_match` + `offer_correct` — kontrola tokenu `[[NABIDKA]]` proti metadatu `expects_offer`; runner token z `answer` odstraňuje a vystavuje jako `offerToken`, aby ho LLM-judge neviděl). Čte `LANGFUSE_*` z `.env.local`. Výsledky: Langfuse → Datasets → dataset → **Experiments**. Zdrojová CSV a postup importu viz `docs/evaluation/langfuse_datasets/` (Fáze 15). Změny metadat items (např. `expects_offer`) se do Langfuse promítají skriptem `scripts/langfuse-sync-metadata.mjs` (upsert podle `id`, bez re-importu — viz README datasetů).

### Databáze

```bash
supabase init                    # jednorázová inicializace Supabase projektu
supabase db push                 # aplikuje migrace na Supabase (vyžaduje DATABASE_URL)
```

Všechny změny DB schématu jdou výhradně přes migrační soubory v `supabase/migrations/` — nikdy neprovádět ruční úpravy v SQL editoru Supabase. Aktuální migrace: `001_init.sql` (tabulky `documents`/`chunks` + HNSW index), `002_match_chunks.sql` (RPC `match_chunks` použité při retrievalu), `003_app_settings.sql` (jednořádková tabulka `app_settings` s runtime parametry RAG), `004_enable_rls.sql` (zapnutí Row-Level Security na `documents`/`chunks`/`app_settings` — bez policy pro anon; app používá service-role klíč, který RLS obchází), `005_feedback.sql` (tabulka `feedback`), `006_telemetry_settings.sql` (`app_settings` += `telemetry_enabled`, `record_content`) `007_chunk_sections.sql` (`chunks` += `section_path`; `match_chunks` ji nově vrací — funkce se kvůli změně návratového typu dropuje a vytváří znovu), `008_chunking_settings.sql` (`app_settings` += `chunk_target_size`/`chunk_breadcrumb`/`chunk_strip_headers`, `documents` += `chunking_config`), `009_chunk_batch.sql` (`chunks` += `batch_id` — reindexace bez ztráty dat, oprava C1), `010_leads.sql` (tabulka `leads` — poptávky/lead generation, včetně RLS), `011_auth_state.sql` (jednořádková tabulka `auth_state` — revokace admin session po logoutu, oprava SEC-4; vč. RLS), `012_lead_type.sql` (`leads` += `type` — `produkt`/`hodnoceni`, Fáze 16; stávající řádky `produkt` přes DEFAULT) `013_prompt_settings.sql` (`app_settings` += `system_prompt`/`lead_summary_prompt` — nullable, NULL = výchozí konstanta v kódu; Fáze 17) a `014_users_roles.sql` (tabulka `users` — identity a aplikační role, rozšíření `citext`; etapa A plánu rolí) a `015_must_change_password.sql` (`users` += `must_change_password` — vynucená změna iniciálního hesla; etapa B) a `016_job_roles_audiences.sql` (`audiences`, `job_roles`, vazební tabulky, view `user_effective_audiences`, `documents.visibility`, `app_settings.default_document_visibility`, `match_chunks` += `caller_audiences`; etapa C).

## Proměnné prostředí

Úplný seznam viz `.env.example`. Povinné klíče:

| Proměnná | Účel |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API (pouze server) |
| `VOYAGE_API_KEY` | Voyage AI embeddingy (pouze server) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase projektu (může být veřejná) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin klíč Supabase (pouze server, nikdy na klienta) |
| `DATABASE_URL` | Postgres connection string pro migrace |
| `ADMIN_EMAIL` | E-mail prvního uživatele — jen pro `scripts/seed-admin-user.mjs`, ne pro běh aplikace (`ADMIN_USERNAME` je starší fallback) |
| `ADMIN_PASSWORD` | Heslo prvního uživatele — dtto (min. 12 znaků) |
| `ADMIN_FIRST_NAME` / `ADMIN_LAST_NAME` | Jméno a příjmení prvního uživatele (volitelné) |
| `SESSION_SECRET` | Podpisový klíč admin session cookie (dlouhý náhodný řetězec, povinný) |
| `TOP_K` | Výchozí počet výsledků z retrievalu (5) |
| `SIMILARITY_THRESHOLD` | Výchozí práh kosinové podobnosti (0.35) |
| `LLM_TEMPERATURE` | Výchozí teplota Claude (0.2) |
| `CHAT_MODEL` | Model pro chat (volitelný, default `claude-sonnet-4-6`) |
| `MISTRAL_API_KEY` | Mistral API klíč pro shrnutí poptávek (prototypový test — Varianta B; chybějící → shrnutí degraduje na `null`, lead se uloží; čte ho `@ai-sdk/mistral` z env) |
| `SUMMARY_MODEL` | Model pro shrnutí poptávek (volitelný, default `mistral-small-latest`, přes `@ai-sdk/mistral`) |
| `OIDC_ISSUER` | URL firemního IdP (volitelné — bez něj se SSO nenabídne, heslo funguje dál) |
| `OIDC_CLIENT_ID` | Client ID registrované aplikace u IdP |
| `OIDC_CLIENT_SECRET` | Client secret (pouze server) |
| `OIDC_GROUPS_CLAIM` | Název claimu se skupinami (default `groups`) |
| `OIDC_REDIRECT_BASE_URL` | Základ redirect URI, když se origin liší od veřejné adresy (volitelné) |
| `LANGFUSE_SECRET_KEY` | Langfuse server klíč (volitelný — bez něj app funguje, jen se neloguje) |
| `LANGFUSE_PUBLIC_KEY` | Langfuse veřejný klíč (volitelný) |
| `LANGFUSE_BASE_URL` | URL Langfuse instance (default `https://cloud.langfuse.com`) |

`TOP_K`, `SIMILARITY_THRESHOLD` a `LLM_TEMPERATURE` jsou jen **výchozí / fallback** hodnoty: runtime hodnoty se čtou z tabulky `app_settings` (editovatelné v `/admin/parameters`). Když tabulka chybí nebo je DB nedostupná, použijí se tyto env defaulty (viz `lib/settings.ts`).

## Architektura

### Stránky a API routy

```
/                       → Chat UI (hook useKecaloChat, streamování, blok zdrojů, disclaimer)
/demo                   → Demo stránka „Pojišťovny Jistota" s vysouvacím widgetem ChatWidget
/admin                  → Dashboard (přehled znalostní báze — metrické karty + grafy)
/admin/documents        → Upload + tabulka dokumentů
/admin/leads            → Poptávky (tabulka + akce Převzít/Uzavřít)
/admin/retrieval-test   → Panel test retrievalu
/admin/parameters       → RAG parametry (slidery TOP_K, práh podobnosti, teplota; telemetrie, chunkování)
/admin/parameters/prompts → Prompty (system prompt chatu + prompt shrnutí poptávek; Fáze 17)
/admin/users            → Správa uživatelů (pouze admin): založení, role, deaktivace, reset hesla
/admin/login            → Login (uživatelské jméno + heslo), nastaví session cookie
/admin/change-password  → Změna vlastního hesla; mimo route group (authenticated), aby nevznikl redirect cyklus

POST   /api/chat                → RAG pipeline → streamovaná odpověď + metadata zdrojů (X-Sources) + X-Trace-Id; nepovinné sessionId v těle (jen telemetrie)
POST   /api/documents           → upload → extrakce → chunking → embeddingy → uložení (409 při duplicitním názvu)
GET    /api/documents           → seznam dokumentů se stavem
DELETE /api/documents/[id]      → smazání dokumentu, chunků (CASCADE), souboru v Storage
POST   /api/documents/[id]/reprocess → reindexace bez re-uploadu (aktuální parametry chunkování)
POST   /api/retrieval-test      → vrátí top-k chunků se skóre (pouze admin)
GET    /api/settings            → vrátí aktuální runtime parametry + přepínače telemetrie z DB
POST   /api/settings            → uloží globální runtime parametry RAG do app_settings
POST   /api/feedback            → uloží zpětnou vazbu (thumbs up/down); limity vstupu + rate limit 10/min; volitelné traceId → skóre `user-thumbs` v Langfuse
POST   /api/leads               → uloží poptávku (veřejné); rate limit 5/min, pole `type` (`produkt`/`hodnoceni`, default `produkt`; jiná hodnota → 400), deduplikace podle kontaktu **v rámci téhož typu**, shrnutí konverzace pro oba typy Mistral modelem (`@ai-sdk/mistral`, `SUMMARY_MODEL` default `mistral-small-latest` — prototypový test, Varianta B; prompt `LEAD_SUMMARY_PROMPT` z `lib/rag/prompts.ts`, runtime override v `app_settings.lead_summary_prompt`; přepis izolován v bloku <transcript> jako nedůvěryhodný vstup — oprava SEC-9, wrapping i sanitizace zůstávají v kódu)
PATCH  /api/leads/[id]          → změna stavu poptávky (pouze admin): in_progress/closed; 400/404/409
GET    /api/users               → seznam uživatelů (pouze admin)
POST   /api/users               → založení uživatele (admin): povinné `firstName`, `lastName`, `email` + `appRole`; heslo vygeneruje aplikace a vrátí JEDNOU v odpovědi, 409 při duplicitním e-mailu
PATCH  /api/users/[id]          → změna jména, e-mailu, role, aktivace, reset hesla, pracovní role (admin); 409 u posledního admina, vlastní role i u osobních údajů SSO účtu, 404 neexistující
POST   /api/auth/login          → ověření e-mailu + hesla proti tabulce users, nastavení session cookie
POST   /api/auth/logout         → smazání session cookie + per-user revokace
POST   /api/auth/change-password → změna vlastního hesla (přihlášený); projde i účtu s must_change_password
GET    /api/auth/oidc/start     → zahájení SSO (redirect na IdP; state + nonce + PKCE ve stavové cookie)
GET    /api/auth/oidc/callback  → návrat od IdP: ověření tokenu, JIT provisioning, vydání session cookie
```

### Cílová adresářová struktura

```
src/
├── proxy.ts                          # ochrana /admin + admin API rout (session cookie; API → 401)
├── instrumentation.ts                # registrace OTel provideru + Langfuse processoru (Node.js runtime)
├── app/
│   ├── page.tsx                      # Chat UI (fullscreen)
│   ├── demo/page.tsx                 # Demo stránka „Pojišťovny Jistota" s <ChatWidget />
│   ├── admin/
│   │   ├── login/page.tsx            # Login (mimo route group — nechráněno)
│   │   ├── change-password/          # Změna vlastního hesla (page + client, mimo route group)
│   │   └── (authenticated)/         # route group chráněná proxy vrstvou
│   │       ├── layout.tsx            # Sidebar layout (Console styl)
│   │       ├── page.tsx              # Dashboard (přehled znalostní báze)
│   │       ├── documents/page.tsx    # server část (načtení dokumentů)
│   │       ├── documents/client.tsx  # klientská část (upload + tabulka)
│   │       ├── leads/page.tsx        # server část (načtení poptávek)
│   │       ├── leads/client.tsx      # klientská část (tabulka + akce Převzít/Uzavřít)
│   │       ├── users/page.tsx        # server část (seznam uživatelů)
│   │       ├── users/client.tsx      # klientská část (založení, role, reset hesla)
│   │       ├── retrieval-test/page.tsx
│   │       ├── parameters/page.tsx    # server část (getSettings) — „RAG parametry"
│   │       ├── parameters/client.tsx  # klientská část (slidery + uložení)
│   │       └── parameters/prompts/    # podsekce „Prompty" (page + client, Fáze 17)
│   └── api/
│       ├── chat/route.ts
│       ├── documents/route.ts
│       ├── documents/[id]/route.ts
│       ├── documents/[id]/reprocess/route.ts  # reindexace bez re-uploadu
│       ├── leads/route.ts            # POST poptávka (veřejné) + shrnutí (Mistral) + deduplikace
│       ├── leads/[id]/route.ts       # PATCH stav poptávky (admin)
│       ├── retrieval-test/route.ts
│       ├── settings/route.ts
│       ├── feedback/route.ts
│       ├── users/route.ts            # GET seznam + POST založení (admin)
│       ├── users/[id]/route.ts       # PATCH role/aktivace/reset hesla (admin)
│       └── auth/{login,logout,change-password}/route.ts
├── components/
│   ├── MessageBubble.tsx              # vrací null pro prázdný content (vyhne se dvojité bublině s tečkami)
│   ├── ChatMessages.tsx               # scrollovatelná oblast zpráv, sdílená mezi / a widgetem (prop compact)
│   ├── ChatWidget.tsx                 # vysouvací widget: bublina v rohu → panel, vždy namountovaný
│   ├── SourcesBlock.tsx
│   ├── LeadForm.tsx                  # karta poptávky pod odpovědí (varianty produkt/hodnoceni)
│   ├── UploadZone.tsx
│   ├── DocumentsTable.tsx
│   ├── AdminSidebar.tsx              # navigace admin sekce (Parametry = rozbalitelná skupina)
│   ├── StatusBadge.tsx               # badge stavu dokumentu
│   ├── LeadStatusBadge.tsx           # badge stavu poptávky
│   ├── LeadTypeBadge.tsx             # badge typu poptávky (Produkt/Hodnocení)
│   ├── AppRoleBadge.tsx             # badge aplikační role (Admin/Editor/Čtenář)
│   ├── SsoStatus.tsx                # indikátor konfigurace SSO (sidebar + /admin/users)
│   ├── StatCard.tsx                  # metrická karta dashboardu
│   ├── FeedbackCard.tsx              # karta spokojenosti (% + poměrový pruh)
│   ├── ChunksByDocChart.tsx          # graf chunků (CSS bary)
│   └── ui/                           # shadcn/ui primitiva
└── lib/
    ├── use-kecalo-chat.ts             # hook useKecaloChat() — sdílená chat logika (/ i ChatWidget)
    ├── config.ts                     # konstanty z env, default hodnoty
    ├── telemetry.ts                  # OTel: singleton span processoru + withSpan/getTracer/flushTelemetry
    ├── langfuse-score.ts             # zápis skóre user-thumbs do Langfuse (REST klient, líný singleton, fail-open)
    ├── supabase.ts                   # Supabase client (service role)
    ├── auth.ts                       # podpis/ověření session cookie v2 (HMAC, nese uid)
    ├── auth/oidc.ts                  # OIDC: konfigurace z env, discovery s cache, extrakce claims
    ├── auth/oidc-flow.ts             # stav OIDC toku (state/nonce/PKCE) v podepsané cookie
    ├── auth/provision.ts             # JIT provisioning SSO účtu + sync rolí ze skupin
    ├── password.ts                   # scrypt hash/verify hesel + burnPasswordTime (timing)
    ├── validation.ts                 # sdílené validace (e-mail, jméno) + fullName()
    ├── session-user.ts               # getSessionUser(): identita + aplikační role z DB
    ├── require-role.ts               # druhá obranná linie: requireAppRole(min) v handlerech (SEC-2)
    ├── session-revocation.ts         # revokace session: per-user + globální kill-switch (SEC-4)
    ├── rate-limit.ts                 # sdílený in-memory rate limit (sliding window per IP; x-real-ip, eviction bez clear)
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
    ├── 004_enable_rls.sql            # RLS na documents/chunks/app_settings
    ├── 005_feedback.sql              # tabulka feedback (zpětná vazba thumbs up/down)
    ├── 006_telemetry_settings.sql    # app_settings += telemetry_enabled, record_content
    ├── 007_chunk_sections.sql        # chunks += section_path, match_chunks vrací sekci
    ├── 008_chunking_settings.sql     # app_settings += chunk_*, documents += chunking_config
    ├── 009_chunk_batch.sql           # chunks += batch_id (reindexace bez ztráty dat)
    ├── 010_leads.sql                 # tabulka leads (poptávky/lead generation, vč. RLS)
    ├── 011_auth_state.sql            # auth_state (globální revokace session, SEC-4)
    ├── 014_users_roles.sql           # tabulka users (identity + aplikační role, etapa A)
    ├── 015_must_change_password.sql  # users += must_change_password (etapa B)
    ├── 016_job_roles_audiences.sql   # pracovní role, štítky, viditelnost dokumentů (etapa C)
    ├── 017_job_role_external_group_unique.sql  # jedna skupina IdP = nejvýš jedna role (etapa D)
    └── 018_user_names.sql            # users: username → email, + first_name/last_name, −display_name
scripts/
├── langfuse-eval.mjs                 # eval runner (Fáze 15) — experiment.run nad Langfuse datasety
├── langfuse-sync-metadata.mjs        # sync metadat items (expects_offer) do Langfuse — upsert podle id
├── seed-admin-user.mjs               # založení prvního admin uživatele (etapa A plánu rolí)
├── mock-idp.mjs                      # minimální OIDC provider pro test SSO bez tenantu (etapa D)
└── verify-rate-limit.mjs             # ověření SEC-1 rate-limitu na Vercelu
docs/
├── ARCHITECTURE.md                   # technický popis architektury pro vývojáře (aktuální stav)
├── sso-setup.md                      # návod na zapnutí SSO (registrace u IdP, env, mapování skupin)
├── IMPLEMENTATION_PLAN.md            # hlavní prováděcí checklist projektu (fáze + průběžný stav)
├── PRD_pojistovaci_RAG_chatbot.md    # zadání/PRD
├── seed-docs/                        # reálné PDF dokumenty Kooperativy (obsah znalostní báze)
├── plans/                            # feature/experimentální plány (Langfuse, lead-gen, Mistral, widget, demo, role a přístup k dokumentům)
├── reviews/                          # nálezy a opravné plány z code/security revizí
└── evaluation/
    ├── testovaci_otazky*.md          # sady testovacích otázek (markdown)
    └── langfuse_datasets/             # CSV datasety testovacích otázek pro Langfuse + README (Fáze 15)
```

### RAG — dvě oddělené pipeline

**Pozor na rozdělení odpovědností:** `src/lib/rag/pipeline.ts` NENÍ dotazovací (chat) pipeline — je to **indexační (ingestion) pipeline**. Chat pipeline žije v `src/app/api/chat/route.ts` ve spojení s `prompts.ts`.

#### Indexace dokumentu — `pipeline.ts` (`processDocument`)
Spouští se z `POST /api/documents` po uploadu a z `POST /api/documents/[id]/reprocess` (reindexace). Načte runtime parametry chunkování (`getSettings()`) → stáhne soubor ze Storage → `extract.ts` → `clean.ts` → `chunk.ts` (s `docTitle` = název souboru bez přípony) → `embed.ts` → **vloží nové chunky** po dávkách 100 s novým `batch_id` → **pak smaže staré** (`batch_id != nový`, atomický příkaz) → nastaví `status = ready` a uloží otisk konfigurace do `documents.chunking_config`. Selhání před výměnou → úklid nového batche, původní chunky přežijí (oprava C1); chyby se uloží do `documents.error_message`.

#### Dotaz / chat — `api/chat/route.ts` + `prompts.ts`
Vstup se validuje (`parseMessages`: role jen user/assistant, content string do 4 000 znaků, max 50 zpráv; jinak 400) a routa má rate limit 20 požadavků/min na IP (sdílený helper `lib/rate-limit.ts`; 429). Pak `retrieve(query)` → pokud `chunks.length === 0` fallback (viz níže), jinak `buildContextBlock` vloží chunky do system promptu (atribut `source` = dokument, `section_path`, strana → citace typu „(VPP M-100/23, čl. 29 odst. 8, strana 11)"). Metadata zdrojů (filename, page, section, zaokrouhlené `similarity`) jdou na klienta v hlavičce odpovědi `X-Sources` (URL-encoded JSON; `buildSourcesHeader` ořezává section na 100 a filename na 80 znaků, při překročení 8 000 znaků se sekce vynechají — ochrana proti limitu velikosti hlaviček). Historie se ořezává na posledních 8 zpráv (`MAX_HISTORY`).

**Telemetrická identita požadavku** (mimo číslované fáze, 4. 8. 2026 — Etapa 2 plánu headless Langfuse): tělo požadavku smí nést nepovinné `sessionId` (`parseSessionId`, ≤ 64 znaků jako v `/api/feedback`). Slouží **výhradně k telemetrii** — nevalidní nebo chybějící hodnota se tiše ignoruje, na odpověď nemá vliv. Rodičovský span dostává `langfuse.trace.name` = `chat-rag` (bez něj zůstávaly traces v Langfuse nepojmenované a nešly filtrovat) a při dodaném session id i `langfuse.session.id` → konverzace se v Langfuse seskupí v Sessions view. Odpověď vrací v hlavičce `X-Trace-Id` id trace (`span.spanContext().traceId`) — obě větve, streamovaná i fallback. Klient si ho ukládá do `ChatMessage.traceId`; navázání zpětné vazby na trace přijde v další etapě.

#### Moduly `src/lib/rag/`

| Soubor | Odpovědnost |
|---|---|
| `extract.ts` | PDF → text po stránkách přes `unpdf`; prostý text pro `.txt`/`.md` |
| `clean.ts` | Čištění mezi extrakcí a chunkováním: frekvenční odstranění opakovaných záhlaví/patiček stránek (normalizace čísel, práh 60 % stránek, min. 3 — bez hardcoded vzorů) + slepení řádků rozdělených sazbou PDF (interpunkce, zkratky, spojovníky). Čistí po stránkách, mapování na strany zůstává. Exportuje strukturní vzory řádků `STRUCT` a `isStructuralStart` (sdílí s parserem v `chunk.ts`) |
| `chunk.ts` | Strukturní chunkování: parser hierarchie (část → článek → `▶` odstavec, krátké podnadpisy; písmena výčtů `a)` hranici netvoří; řádky přehledu článků se demotují na obsah) + greedy skladač celých sekcí do chunků cílové velikosti dle runtime parametru (default 3 500 znaků, strop 1,3×, bez překryvu) s volitelnou breadcrumb hlavičkou `[docTitle › část › článek › odst.]`, která se embeduje s textem (`ChunkOptions`). `ChunkInput` nese `section_path`. Nestrukturované dokumenty (< 30 % obsahu v sekcích) → dělení po odstavcích |
| `embed.ts` | Embeddingy přes Voyage AI (`voyage-3.5`): `embedQuery` pro jeden dotaz, `embedBatch` pro indexaci. 429 kvůli chybějící platební metodě (limit free tieru) neopakuje a mapuje na srozumitelnou hlášku do `error_message` |
| `retrieve.ts` | `embedQuery` → volá Postgres RPC `match_chunks` (viz `002_match_chunks.sql`, rozšířeno v `007`) → vrátí chunky se skóre `similarity`, `filename` a `section_path` |
| `prompts.ts` | `SYSTEM_PROMPT`, `LEAD_SUMMARY_PROMPT` (výchozí texty — runtime override v `app_settings`, Fáze 17), `FALLBACK_MESSAGE`, `buildContextBlock` (sestaví `<document>` bloky pro kontext) |
| `pipeline.ts` | **Indexace** dokumentu (`processDocument`) — viz výše |

**Práh podobnosti se uplatňuje v SQL**, ne v JS: funkce `match_chunks` vrací jen chunky z dokumentů ve stavu `ready` se `similarity > match_threshold`. Když nic neprojde, `retrieve` vrátí prázdné pole.

**Fallback:** pokud `retrieve` vrátí 0 chunků, route vrací `FALLBACK_MESSAGE` („nenacházím odpověď, kontaktujte infolinku 800 123 456") jako statickou `text/plain` odpověď s prázdným `X-Sources` — Claude se nevolá (oprava B3; dřív se volal jen kvůli doslovnému opsání hlášky).

**Systémový prompt** (`prompts.ts`; od Fáze 17 **runtime editovatelný** v `/admin/parameters/prompts` — chat používá `settings.systemPrompt ?? SYSTEM_PROMPT`, NULL = výchozí z kódu): bot odpovídá výhradně z poskytnutých chunků, česky, neposkytuje poradenství nad rámec citovaných podmínek a nesjednává produkty. **Tón** (upraveno mimo číslované fáze, 24. 7. 2026): persona, sekce `# Tón a forma` a `# Když odpověď v kontextu chybí` přeformulovány z úřednějšího rázu na **profesionálně příjemný a lehce vřelý** — asistent zní jako někdo, kdo oboru rozumí, rád poradí a koho zájem klienta těší; explicitní mantinel proti žovialitě i strohosti, přesnost a opora v podmínkách mají přednost před tónem. Odkaz na infolinku zní jako vstřícné nasměrování, ne odbytí. Funkční pravidla (grounding, vykání, citace, `[[NABIDKA]]`, meze, anti-injection) beze změny. **Citace** (upraveno mimo číslované fáze, 23. 7. 2026): do textu odpovědi se už neopisuje technický název souboru z atributu `source` — jen zkrácený odkaz na článek/odstavec/stranu (např. „čl. 29 odst. 8, strana 11"); plný název zdrojového dokumentu nese samostatně `SourcesBlock` v UI (z `X-Sources` hlavičky). Důvod: surový filename (s příponou a kódem) v prose textu působil na zákazníka technicky a rušivě. U dotazů na konkrétní pojistný produkt — včetně procedurálně formulovaných dotazů na krytí/limity/výluky a dotazů na cenu či sjednání (ty i při nenalezené informaci) — přidá na úplný konec odpovědi samostatný řádek s tokenem `[[NABIDKA]]`; u administrativních dotazů a ostatních odpovědí bez nalezené informace nikdy — klient token z textu odstraní a místo něj vykreslí kartu poptávky (`LeadForm` varianta `produkt`); viz Fáze 14 / `docs/plans/lead_generation_plan.md`.

**Zpětná vazba u odpovědi** (`MessageBubble.tsx`, Fáze 16): palec nahoru → inline poděkování; palec dolů → karta `LeadForm` varianta `hodnoceni` (vlídnější text, lead typu `hodnoceni`). Když je u zprávy už produktová karta (token `[[NABIDKA]]`), palec dolů druhou kartu nevykresluje — jen krátké poděkování (kontakt sbírá produktová). Hlas se vždy ukládá do `/api/feedback` beze změny. Viz `docs/plans/lead_generation_plan.md` (Fáze 2 / Fáze 16).

### Chat UI — fullscreen `/` a widget (mimo číslované fáze, `docs/plans/widget_mini_kecalo_plan.md`)

Chatová logika je sdílená mezi fullscreen stránkou a vysouvacím widgetem přes jeden hook, aby se každá oprava propsala do obou:

- `src/lib/use-kecalo-chat.ts` — hook `useKecaloChat()`: stav zpráv, streamování z `POST /api/chat`, strip tokenu `[[NABIDKA]]`, `getSessionId`, feedback, nová konverzace s abortem, auto-scroll. Kód je doslovný přesun z původního `page.tsx` (fáze refactoru byla ověřená kontrolním bodem před psaním widgetu — žádná regrese ve streamování).
- `src/components/ChatMessages.tsx` — scrollovatelná oblast zpráv (prázdný stav, vzorové otázky, mapování na `MessageBubble`); prop `compact` pro menší widget layout.
- `src/app/page.tsx` (`/`) — skelet nad hookem + `<ChatMessages />`, beze změny chování oproti stavu před refactorem.
- `src/components/ChatWidget.tsx` — vysouvací widget: bublina 56 px v rohu (`fixed bottom-4 right-4`) → panel `380×600px` s korálovou hlavičkou. Panel je **vždy namountovaný**, přepínání čistě CSS (`opacity/translate/scale` + `inert`/`aria-hidden`) — konverzace i běžící stream přežijí minimalizaci (na rozdíl od „Nová konverzace", která stream abortuje).
- `src/app/demo/page.tsx` (`/demo`) — statická demo stránka „Pojišťovny Jistota" s `<ChatWidget />`, simuluje nasazení na reálném webu pojišťovny; veřejná stránka mimo proxy vrstvu.
- `MessageBubble.tsx` vrací `null` pro prázdný `content` — jinak by se u asistentské zprávy těsně po odeslání (než dorazí první token streamu) zobrazila prázdná bublina zároveň s „píšícími" tečkami z `ChatMessages`.

Widget nepřidává žádnou API routu ani útočnou plochu — používá výhradně existující veřejné routy (`/api/chat`, `/api/feedback`, `POST /api/leads`) se stávajícími rate limity. Fáze 2 (embeddovatelný widget na cizí web přes `/widget` + `public/embed.js`) je vědomě odložená — viz „Výhled fáze 2" v plánu.

## Datový model

```sql
documents (id uuid PK, filename text, mime_type text, status text,
           error_message text NULL, chunk_count int, created_at timestamptz,
           chunking_config jsonb NULL)
-- chunking_config = otisk parametrů chunkování z poslední indexace
-- ({target_size, breadcrumb, strip_headers}); NULL = zastaralé (před fází 13)

chunks (id uuid PK, document_id uuid FK→documents ON DELETE CASCADE,
        chunk_index int, page int NULL, section_path text NULL,
        content text, embedding vector(1024), batch_id uuid)
-- batch_id = identifikátor indexačního běhu; reindexace vkládá nový batch
-- a staré chunky maže až po úspěšném vložení (oprava C1)
-- HNSW index nad chunks.embedding; section_path = cesta sekce v hierarchii dokumentu
-- (např. „Část 2 – … › Článek 29 Pojistné plnění"), NULL u nestrukturovaných dokumentů

app_settings (id smallint PK CHECK (id = 1), top_k int, similarity_threshold double precision,
              llm_temperature double precision,
              telemetry_enabled boolean DEFAULT true, record_content boolean DEFAULT false,
              chunk_target_size int DEFAULT 3500, chunk_breadcrumb boolean DEFAULT true,
              chunk_strip_headers boolean DEFAULT true,
              system_prompt text NULL CHECK (≤ 8000), lead_summary_prompt text NULL CHECK (≤ 4000),
              updated_at timestamptz)
-- jednořádková konfigurace (id = 1) s runtime parametry RAG + přepínači telemetrie (Fáze 11)
-- + parametry chunkování (Fáze 13); CHECK rozsahy musí odpovídat min/max v src/lib/settings-meta.ts
-- prompty (Fáze 17, migrace 013): ZÁMĚRNĚ nullable — NULL = „použij výchozí konstantu v kódu"
-- (src/lib/rag/prompts.ts), aby se vylepšení defaultů propisovala s deployi; override vzniká
-- jen editací v /admin/parameters/prompts, „Obnovit výchozí" vrací NULL

feedback (id uuid PK, session_id text, message_index int, rating text CHECK ('up'/'down'),
          query text NULL, created_at timestamptz)
-- UNIQUE (session_id, message_index) — jeden hlas na zprávu v rámci session

leads (id uuid PK, name text, email text NULL, phone text NULL, note text NULL,
       summary text NULL, session_id text NULL,
       status text DEFAULT 'new' CHECK ('new'/'updated'/'in_progress'/'closed'),
       type text DEFAULT 'produkt' CHECK ('produkt'/'hodnoceni'),
       assignee text NULL, consent boolean CHECK (consent),
       created_at timestamptz, updated_at timestamptz)
-- poptávky (lead generation, Fáze 14); CHECK (email OR phone) — aspoň jeden kontakt
-- note ≤ 5000 (limit 500/poznámka vynucuje API; sloupec vyšší kvůli připojování při dedup)
-- summary = shrnutí konverzace Mistral modelem (nahrazuje surový dotaz); RLS zapnuté (migrace 010)
-- type (migrace 012, Fáze 16): 'produkt' = zájem o produkt (token [[NABIDKA]]),
--   'hodnoceni' = kontakt zanechaný po palci dolů; deduplikace je type-scoped
-- poptávky se nemažou — uzavření jen nastaví status closed

users (id uuid PK, email citext UNIQUE, first_name text, last_name text,
       app_role text DEFAULT 'viewer' CHECK ('admin'/'editor'/'viewer'),
       auth_provider text DEFAULT 'local' CHECK ('local'/'oidc'),
       password_hash text NULL, external_issuer text NULL, external_subject text NULL,
       is_active boolean DEFAULT true, must_change_password boolean DEFAULT false,
       sessions_invalid_before timestamptz DEFAULT epoch,
       created_at timestamptz, updated_at timestamptz)
-- identity a aplikační role (migrace 014, etapa A plánu rolí)
-- e-mail je zároveň PŘIHLAŠOVACÍ ÚDAJ (migrace 018 přejmenovala `username`);
--   citext = adresa se nesmí lišit velikostí písmen. Formát se kontroluje jen
--   v API, ne v DB — seedovaný účet `admin` adresou není a CHECK by migraci
--   shodil; správce si ho opraví v /admin/users
-- first_name/last_name NOT NULL (migrace 018); u účtů z doby před ní padlo
--   jméno na e-mail a příjmení na pomlčku CHECK: local účet musí mít heslo, oidc účet
-- external_subject; UNIQUE (external_issuer, external_subject) — identita SSO
-- stojí na dvojici (vydavatel, subjekt), nikdy na e-mailu
-- must_change_password (migrace 015, etapa B): iniciální heslo od admina;
--   dokud je true, uživatel smí jen změnit heslo (403 na všech ostatních routách)
-- uživatelé se nemažou, jen deaktivují (is_active = false)

auth_state (id smallint PK CHECK (id = 1),
            sessions_invalid_before timestamptz DEFAULT '1970-01-01',
            updated_at timestamptz)
-- jednořádková tabulka (id = 1) pro revokaci admin session (SEC-4, migrace 011)
-- logout nastaví sessions_invalid_before = now(); token s ts < touto hranicí je
-- odmítnut. Default epoch = žádná revokace (nasazení migrace neodhlásí aktivní session)
```

Hodnoty `status` dokumentu: `uploaded → processing → ready | error`
Hodnoty `status` poptávky: `new`/`updated` → `in_progress` → `closed` (`closed` terminální; `updated` = rozšířeno deduplikací)

## Admin autentizace

`/admin` a admin API routy (`/api/documents*`, `/api/leads*`, `/api/settings`, `/api/retrieval-test`) jsou chráněny proxy vrstvou (`src/proxy.ts` — dřív `middleware.ts`, přejmenováno dle konvence Next.js 16), která kontroluje session cookie nastavenou na `/admin/login`; stránky bez cookie přesměruje na login, API routy vracejí 401 JSON. Veřejné zůstávají `/api/chat`, `/api/feedback`, `/api/auth/*` a **`POST /api/leads`** (odeslání poptávky z chatu; ostatní metody na `/api/leads*`, zejména `PATCH`, vyžadují session).

**Identity a aplikační role (etapa A plánu rolí, `docs/plans/roles_and_document_access_plan.md`):** uživatelé žijí v tabulce `users` (migrace `014`), ne v env proměnných. Každý má právě jednu **aplikační roli** — `admin` / `editor` / `viewer` (co smí dělat). Hierarchie je `viewer < editor < admin`; `roleAtLeast()` v `src/lib/session-user.ts`. Rozdělení rout:

| Routa | Minimální role |
|---|---|
| `GET /api/documents`, `POST /api/retrieval-test`, `GET /api/settings` | `viewer` |
| `POST /api/documents`, `DELETE /api/documents/[id]`, `.../reprocess`, `PATCH /api/leads/[id]` | `editor` |
| `POST /api/settings` (vč. promptů), `/api/users*`, `/api/job-roles*`, `/api/audiences*` | `admin` |
| `PATCH /api/documents/[id]` (viditelnost, štítky) | `editor`; `public` a cizí štítky jen `admin` |

Vodicí pravidlo: **editor spravuje obsah a agendu, ne systém.** Prompty a RAG parametry jsou konfigurace chování bota, proto zůstávají adminovi.

**Druhá obranná linie** (oprava SEC-2): každý z 8 admin handlerů volá na prvním řádku `requireAppRole(min)` z `src/lib/require-role.ts` (dřív `requireAdmin()` z `require-admin.ts`) — vrací `{ ok: true, user }`, nebo hotovou odpověď **401** (nepřihlášen) / **403** (přihlášen, ale nemá roli). Proxy v edge runtimu nemá přístup k DB, takže roli i revokaci ověřuje až tato Node vrstva; proxy zůstává rychlým podpisovým gatem.

**Session cookie v2** (`v2.ts.uid.nonce.sig`, platnost 8 h) je podepsaná HMAC-SHA256 klíčem `SESSION_SECRET` (nikdy ne heslem); ověření podpisu je constant-time (`crypto.subtle.verify`), při chybějícím `SESSION_SECRET` proxy přístup zamítá. Oproti v1 nese **id uživatele** — starý tříčlenný formát je záměrně odmítnut. Aplikační role se do cookie **nedává**: čte se z DB při každém požadavku (`getSessionUser()`), aby odebrání oprávnění platilo okamžitě a cookie nebyla zdrojem pravdy.

**Hesla** se hashují `scrypt`em z `node:crypto` (`src/lib/password.ts`, formát `scrypt$N$r$p$salt$hash`, porovnání `timingSafeEqual`). Login ověřuje i `is_active` a `auth_provider` — účet s `auth_provider='oidc'` se heslem přihlásit nesmí (byla by to cesta okolo IdP, tedy okolo MFA i deaktivace). Pro neznámé, neaktivní i SSO uživatelské jméno se volá `burnPasswordTime()`, aby latence neprozradila existenci účtu.

**Rate limit loginu:** per-IP 5 pokusů / 15 min, **per-username 5 / 15 min** (cílený útok na jeden účet nezablokuje ostatní) a globální strop 300 selhání / 15 min jako pojistka poslední instance. Globální strop byl původně 30 — s jedinou identitou to dávalo smysl, s více účty by se stal DoS vektorem. Identita klienta se bere z `x-real-ip`, fallback pravá hodnota `x-forwarded-for` (`lib/rate-limit.ts` — `clientIp`).

**Revokace session** je dvouúrovňová: per-user `users.sessions_invalid_before` (logout, reset hesla, deaktivace — odhlásí jen dotčeného) a globální `auth_state` (migrace `011`), z níž je od zavedení `users` už jen **ruční kill-switch pro incident**. Logout volá `revokeUserSessions(userId)`; volat z něj `revokeAllSessions()` by znamenalo, že kterýkoli uživatel odhlásí celou organizaci. Fail-open při chybějící tabulce `auth_state`.

**Správa uživatelů (`/admin/users`, etapa B):** zakládá je admin, ale **heslo si nevymýšlí — generuje ho aplikace** (`generatePassword()` v `lib/password.ts`, 16 znaků bez zaměnitelných 0/O/1/l) a zobrazí ho jednou; v DB je od začátku jen hash. Protože se předává mimo aplikaci, dostane účet `must_change_password = true` a **dokud si heslo nezmění, nesmí dělat nic jiného**: `requireAppRole()` vrací 403 s příznakem `mustChangePassword` na všech routách a admin layout přesměruje na `/admin/change-password`. Kdyby platil jen redirect, stačilo by volat API přímo. Úspěšná změna hesla revokuje session a vydá novou cookie — ukradená session s iniciálním heslem tím padá. Reset hesla adminem koloběh opakuje. Dvě pojistky proti zamčení a nedopatření: **poslední aktivní admin** nejde degradovat ani deaktivovat (409) a **vlastní roli si admin měnit nesmí** (409; změna role revokuje session, takže by to vypadalo jako náhlé vypadnutí z administrace). Reset vlastního hesla povolený je. Stránka `/admin/change-password` je záměrně **mimo** route group `(authenticated)` — uvnitř by redirect z layoutu vytvořil cyklus.

**Založení prvního uživatele:** `node scripts/seed-admin-user.mjs` (idempotentní, `--force` přepíše heslo a odhlásí session). `ADMIN_USERNAME`/`ADMIN_PASSWORD` slouží už jen jemu — v `src/lib/config.ts` záměrně nejsou, aplikace je za běhu nepoužívá. Lazy bootstrap při loginu je vědomě neimplementovaný (byla by to trvalá zadní vrátka).

**SSO (etapa D):** je-li nastavený `OIDC_ISSUER`, login nabídne „Přihlásit přes firemní účet". Tok chrání `state` (CSRF), `nonce` (replay) i PKCE; všechny tři se drží v podepsané httpOnly cookie (`oidc-flow.ts`), ne v paměti serveru — na serverless běží start a callback klidně na jiné instanci. Účet vzniká JIT při prvním přihlášení jako **stín identity** (`password_hash` NULL), páruje se přes `(external_issuer, external_subject)` — **nikdy přes e-mail**. Skupiny z claims se mapují na pracovní role přes `job_roles.external_group` a **IdP je jejich zdrojem pravdy**: každé přihlášení sadu přepíše a při změně revokuje ostatní session. Aplikační role se z IdP záměrně nemapuje — nový SSO uživatel je vždy `viewer`. HTTP issuer je povolen jen pro `localhost` (mock IdP), jinak knihovna vyžaduje HTTPS.

## Runtime parametry RAG (`/admin/parameters`)

Parametry laditelné za běhu bez redeploye. **Pozor na zásadní rozdíl:** parametry retrievalu/generování působí **při dotazu** (změna okamžitá), parametry chunkování působí **při indexaci** (změna se projeví až reindexací dokumentů — UI to komunikuje žlutým upozorněním s odkazem na Dokumenty).

| Parametr | Rozsah | Kde se uplatní |
|---|---|---|
| `top_k` | 1–20 | počet chunků z retrievalu (při dotazu) |
| `similarity_threshold` | 0–1 | práh podobnosti v `match_chunks` (při dotazu) |
| `llm_temperature` | 0–1 | teplota Claude (hlavní větev chatu; fallback je statický, bez LLM) |
| `chunk_target_size` | 1500–6000 | cílová velikost chunku ve znacích (při indexaci) |
| `chunk_breadcrumb` | bool | breadcrumb hlavička na začátku chunku (při indexaci) |
| `chunk_strip_headers` | bool | odstraňování záhlaví/patiček stránek (při indexaci) |
| `system_prompt` | text ≤ 8000, NULL = výchozí | system prompt chatu (při dotazu; Fáze 17) |
| `lead_summary_prompt` | text ≤ 4000, NULL = výchozí | prompt shrnutí poptávek (Mistral model; při založení leadu) |
| `default_document_visibility` | `public`/`restricted` | výchozí viditelnost nově nahraného dokumentu (při uploadu); `public` = veřejná báze (dnešní chování), `restricted` = interní báze |

- **Úložiště:** jednořádková tabulka `app_settings` (id = 1), migrace `003_app_settings.sql` (+ `006`, `008`, `013`).
- **Server:** `lib/settings.ts` — `getSettings()` (čte přes service-role klienta; fallback na env `config` / tovární defaulty při chybějící tabulce / chybě DB) a `saveSettings()` (validace + clamp + uložení).
- **Sdílená metadata:** `lib/settings-meta.ts` (`SETTINGS_FIELDS`, `TELEMETRY_FIELDS`, `CHUNKING_SLIDER_FIELDS`/`CHUNKING_TOGGLE_FIELDS`, `PROMPT_FIELDS` (`TextField`, Fáze 17), agregáty `ALL_NUMERIC_FIELDS`/`ALL_TOGGLE_FIELDS`, `clampField`, `parseTextField`, `parseSettingsInput`, `chunkingConfigOf`/`isChunkingStale`) — bez server importů, sdílí klient, API i server. Rozsahy jsou jediný zdroj pravdy; CHECK v migracích je druhá obranná linie.
- **Napojení (při dotazu):** `chat/route.ts` i `retrieval-test/route.ts` volají `getSettings()` při každém requestu (záměrně bez cache → změny se projeví okamžitě) a předávají hodnoty do `retrieve()` / `streamText`.
- **Napojení (při indexaci, Fáze 13):** `pipeline.ts` (`processDocument`) volá `getSettings()` a předává `chunkStripHeaders` do `cleanPages()` a `chunkTargetSize`/`chunkBreadcrumb` do `chunkText()`; po úspěchu ukládá otisk `chunkingConfigOf(settings)` do `documents.chunking_config`.
- **Reindexace:** `POST /api/documents/[id]/reprocess` znovu spustí `processDocument` nad originálem ve Storage (`after()` + `maxDuration = 60`). Kontrola stavu a přepnutí na `processing` probíhá jedním podmíněným updatem (oprava C2) — souběžné volání → 409, neexistující dokument → 404. Tabulka dokumentů porovnává `chunking_config` s aktuálním nastavením (`isChunkingStale`; `NULL` = zastaralé) a zobrazuje žlutou indikaci + tlačítko Reindexovat (ikona RefreshCw) u `ready`/`error` dokumentů.
- **UI:** sidebar položka **Parametry** je rozbalitelná skupina (styl platform.claude.com; auto-expand při aktivní podsekci, děti mají exact-match active state) se dvěma podsekcemi:
  - **RAG parametry** (`/admin/parameters`, server `page.tsx` + klient `client.tsx`) — tři skupiny (slidery RAG · Telemetrie · Chunkování), karty `SliderCard`/`ToggleCard`, tlačítka **Uložit** a **Obnovit výchozí** (reset zachovává prompt overridy — ty spravuje podsekce Prompty).
  - **Prompty** (`/admin/parameters/prompts`, Fáze 17) — karty `PromptCard` (textarea s efektivním textem, badge **Výchozí**/**Vlastní**, počítadlo znaků, per-card „Obnovit výchozí" → NULL, žlutá varování: system prompt nese instrukci tokenu `[[NABIDKA]]`, summary prompt SEC-9 formulaci). Karta je ve výchozím stavu **zamčená** (readOnly, ochrana proti náhodnému přepsání — overridy nemají historii): editaci aktivuje tlačítko **Upravit**, **Zamknout** zahodí neuložené změny karty; „Obnovit výchozí" funguje jen odemčené; po Uložit se karty opět zamknou. Při uložení se text shodný s defaultem normalizuje na NULL. Změny působí při dotazu — okamžitě, bez reindexace.
- Admin API routy (`/api/settings`, `/api/documents*`, `/api/retrieval-test`) jsou od opravy A1 (viz `docs/reviews/issues_correction_plan.md`) chráněny proxy vrstvou (`src/proxy.ts`) — bez platné session cookie vracejí 401.

## Observabilita (Langfuse)

RAG pipeline je trasována přes OpenTelemetry s exportem do Langfuse Cloud. Podrobný plán a gotchas viz [`docs/plans/LANGFUSE_PLAN.md`](docs/plans/LANGFUSE_PLAN.md).

- **`src/instrumentation.ts`** — Next.js hook `register()`: jednou při startu (Node.js runtime) zaregistruje `NodeTracerProvider` se sdíleným `LangfuseSpanProcessor`. Guard přes `globalThis` proti dvojí registraci (HMR). Bez Langfuse klíčů se neregistruje nic (warning + app běží dál).
- **`src/lib/telemetry.ts`** — jediný zdroj pravdy pro OTel: singleton `langfuseSpanProcessor` (drží se zde, aby na něj dosáhl i flush), `getTracer()`, `withSpan(name, fn, attrs)` (přes **`startActiveSpan`** — nutné pro vnořování spanů a zařazení AI SDK LLM spanu) a `flushTelemetry()` (`forceFlush` pro `after()` callbacky). Bez klíčů jsou všechny helpery no-op.
- **Span filtr:** `shouldExportSpan` propustí vše kromě interního šumu `next.js` — výchozí smart-filtr Langfuse by zahodil naše vlastní `kecalo` spany (nemají `gen_ai.` atributy).
- **Serverless export:** na Vercelu (`process.env.VERCEL`) má `LangfuseSpanProcessor` `exportMode: "immediate"` — default `batched` ztrácel pozdní spany (`chat-pipeline` + LLM končí v `onFinish` po dostreamování, funkce zmrzne dřív, než se batch odešle). Lokálně/long-running zůstává `batched`. Pozn.: `LANGFUSE_*` musí být v **Project** env proměnných Vercelu (ne jen Shared) + redeploy.
- **Instrumentované cesty:** chat (`chat-pipeline` → `retrieval` → `embed.query`/`vector-search`; LLM span automaticky z AI SDK přes `experimental_telemetry`), shrnutí poptávek (`lead.summarize`), indexace (`document.process` → download/extract/clean/chunk/embed-batch/insert-chunks), upload (`document.upload`), retrieval-test (`retrieval-test`).
- **Identita trace (4. 8. 2026):** `chat-pipeline` nese `langfuse.trace.name` = `chat-rag` a volitelně `langfuse.session.id`; trace id jde na klienta hlavičkou `X-Trace-Id`. Detaily viz „Telemetrická identita požadavku" v sekci Dotaz / chat.
- **Otisk verze promptu (4. 8. 2026):** trace nese `langfuse.trace.metadata.prompt_hash` (prvních 12 znaků SHA-256 **efektivního** systémového promptu) a `prompt_source` (`default`/`override`). Umožní porovnat skóre napříč verzemi promptu, aniž by se prompt stěhoval do Langfuse Prompt Managementu — levná náhrada, viz plán headless Langfuse (Etapa 4). Posílá se **jen otisk, nikdy text promptu**. Metadata jsou schválně na úrovni trace, ne generation: skóre `user-thumbs` sedí také na trace, jinak by je nešlo spárovat.
- **Uživatelská zpětná vazba jako skóre (4. 8. 2026):** `POST /api/feedback` přijímá volitelné `traceId` (validace `^[0-9a-f]{32}$`) a po uložení do Supabase připne na trace skóre **`user-thumbs`** (`BOOLEAN`, 1 = nahoru / 0 = dolů) přes `src/lib/langfuse-score.ts`. Zápis běží v `after()` a je **fail-open** — Supabase zůstává zdrojem pravdy, Langfuse je druhý konzument. Idempotence přes deterministické `id` (`thumbs:<sessionId>:<messageIndex>`): přehlasování skóre přepíše, nezaloží duplicitu (odpovídá upsertu v DB). Chybějící či nevalidní `traceId` = hlas se uloží, do Langfuse se nic nepošle. Díky tomu jde poprvé filtrovat a měřit kvalitu na **produkčním provozu**, ne jen na eval datasetech.
- **Streaming:** v `chat/route.ts` se rodičovský span ukončí až v `onFinish`/`onError`/`onAbort` streamu (ne při návratu Response), aby latence zahrnula generování a LLM span se nestal osiřelým. `streamText` dostává `abortSignal: request.signal` — odpojení klienta uprostřed streamu (zavřená záložka, abort z `useChat`) tak zastaví generování a span se ukončí v `onAbort` s atributem `chat.aborted` (jinak by zůstal neukončený a v `immediate` režimu se neexportoval).
- **Runtime přepínače (Fáze 11):** podsekce **Telemetrie** v `/admin/parameters` (sloupce `app_settings.telemetry_enabled`, `record_content`):
  - **Telemetrie zapnutá** — master vypínač. Promítá se do proměnného flagu v `telemetry.ts` (`setTelemetryExport`), který čte `shouldExportSpan`: spany se vždy vytvoří, ale při vypnutí se neexportují. Flag obnovuje `getSettings()` (per request) a `saveSettings()` (okamžitě). V chat route navíc gateuje `experimental_telemetry.isEnabled`.
  - **Zaznamenávat obsah promptů a odpovědí** — řídí `recordInputs`/`recordOutputs` v chat route (per request). Default vypnuto (soukromí); zapnout jen pro ladění. Závisí na master vypínači (`ToggleField.dependsOn`): když je telemetrie vypnutá, přepínač se v adminu jen zašedne a nejde měnit — hodnotu nemění (zobrazuje skutečnou uloženou hodnotu, jen je disabled). Při opětovném zapnutí telemetrie se `recordContent` načte čerstvě z DB (`GET /api/settings`), aby se zahodila případná neuložená lokální změna schovaná pod disabled.
- **Soukromí:** ve výchozím stavu do Langfuse nejde obsah dotazů ani dokumentů, jen metadata (tokeny, latence, topK/threshold/temperature, počty chunků). Obsah lze zapnout přepínačem výše.
- **Voyage náklady:** posíláme `embed.total_tokens`; pro přesnou kalkulaci nákladů je nutné v Langfuse dashboardu nadefinovat custom model `voyage-3.5`.

## Seed dokumenty

Reálné dokumenty Kooperativy jsou ve složce `docs/seed-docs/` a slouží jako obsah demo znalostní báze:
- `VPP M-100_23` — pojištění majetku a odpovědnosti občanů (18 s.)
- `VPP M-200_23` — pojištění bytových domů (19 s.)
- `IPID` — informační dokument o pojistném produktu (2 s., rychlá indexace)
- `Informace pro klienta` — předsmluvní informace (11 s.)
- `docs/evaluation/testovaci_otazky*.md` — sady testovacích otázek včetně záměrných otázek mimo bázi pro ověření fallbacku
