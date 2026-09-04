# Kecalo

**Referenční implementace RAG chatbota** nad vlastní znalostní bází — předvedená na příkladu pojišťovny.

Obor není součástí architektury: znalostní bázi tvoří dokumenty, které nahrajete, a chování řídí systémový prompt editovatelný za běhu. Ukázková instalace běží nad reálnými pojistnými podmínkami z [docs/seed-docs/](docs/seed-docs/) a vystupuje jako „Pojišťovna Jistota"; název a logo značky jsou zatím napevno v komponentách (viz [Známá omezení](#známá-omezení)).

Vznikl jako projekt jednodenního kurzu vibecodingu, ale rozsahem ho dávno přerostl — dnes je to **funkční aplikace v předprodukční fázi**: s observabilitou, evaluační pipeline a prošlou bezpečnostní revizí. Do ostrého provozu jí chybí především automatizované testy; autentizace má identity, role i volitelné SSO, ale zatím jen proti mock IdP, a zpracování osobních údajů má hotové jádro — retenci, práva subjektu i zásady zpracování — se zbývajícími kroky popsanými níže (viz [Osobní údaje a GDPR](#osobní-údaje-a-gdpr)).

Návštěvník klade otázky česky; bot odpovídá výhradně z indexovaných dokumentů a u každé odpovědi cituje zdroj (dokument, článek, strana). Na dotazy mimo znalostní bázi odpovídá řízeným fallbackem s odkazem na infolinku. U dotazů se zájmem o produkt nebo službu nabídne kartu poptávky — kontakty se sbírají do admin sekce. Správa znalostní báze, poptávek, RAG parametrů i promptů probíhá za běhu v administraci, bez redeploye.

## Funkce

**Veřejný chat (`/`)**
- Streamovaná odpověď s blokem citovaných zdrojů (dokument, sekce, strana, skóre podobnosti)
- Fallback mimo znalostní bázi (statická odpověď, LLM se nevolá)
- Karta poptávky u produktových dotazů; shrnutí konverzace pro zpracovatele generuje Mistral
- Zpětná vazba palcem nahoru/dolů — palec dolů nabídne zanechání kontaktu
- Souhlas se zpracováním údajů u karty poptávky a odkaz na zásady zpracování (`/privacy`) v patičce chatu i widgetu

**Vysouvací widget (`/demo`)**
- Mini chat jako bublina v rohu obrazovky → panel `380×600px`; demo stránka simuluje nasazení na webu „Pojišťovny Jistota"
- Chat logika sdílená s fullscreenem přes hook `useKecaloChat` — každá oprava se propíše do obou
- Panel je vždy namountovaný (minimalizace čistě CSS) — konverzace i běžící stream přežijí zavření
- Žádná nová API routa ani útočná plocha — používá jen existující veřejné routy

**Administrace (`/admin`, chráněná přihlášením)**
- Dashboard s přehledem znalostní báze (dokumenty, chunky, stavy)
- Upload a správa dokumentů (PDF/TXT/MD), reindexace bez re-uploadu při změně parametrů chunkování
- Poptávky — tabulka se stavy (nová → převzatá → uzavřená), typ produkt/hodnocení
- Test retrievalu — top-k chunků se skóre pro libovolný dotaz
- Runtime parametry RAG (top-k, práh podobnosti, teplota, chunkování) — změny bez redeploye
- Editace system promptu chatu a promptu shrnutí poptávek za běhu
- Správa uživatelů (`/admin/users`, jen pro roli admin) — založení účtu s vygenerovaným iniciálním heslem, změna role, deaktivace, reset hesla
- Pracovní role a štítky dokumentů (`/admin/users/job-roles`, `/admin/users/audiences`) — omezení viditelnosti dokumentů v retrievalu, mapování skupin z IdP na pracovní role
- Soukromí (`/admin/privacy`, jen pro roli admin) — retenční lhůty, vyřízení žádostí subjektů údajů (vyhledání, export, výmaz) a auditní historie provedených úkonů

**Přihlášení firemním účtem (SSO)**

Volitelné — zapíná se proměnnými `OIDC_*`. Postup nasazení včetně registrace
aplikace u identity providera a mapování skupin na role: [docs/sso-setup.md](docs/sso-setup.md).

**Testování SSO bez firemního tenantu**

```bash
node scripts/mock-idp.mjs --groups=Obchod   # lokální OIDC provider na :9090
```
Do `.env.local` pak `OIDC_ISSUER=http://localhost:9090`, `OIDC_CLIENT_ID=kecalo-test`,
`OIDC_CLIENT_SECRET=test-secret`. Mock provider přeskakuje přihlašovací obrazovku
a vydá token komukoli — slouží **výhradně** k lokálnímu ověření toku.

**Provoz**
- Observabilita: OpenTelemetry tracing s exportem do Langfuse (volitelné; obsah dotazů se ve výchozím stavu neloguje)
- Konverzace jsou v Langfuse seskupené přes session id; každá odpověď vrací `X-Trace-Id`, takže palec nahoru/dolů se ukládá jako skóre `user-thumbs` přímo na trace — kvalitu lze měřit i na reálném provozu, nejen na testovacích datasetech
- Každá trace nese otisk (hash) použité verze systémového promptu, takže jde porovnat dopad jeho úprav na hodnocení — bez stěhování promptů mimo repozitář
- Evaluace: `npm run eval` prožene testovací otázky z Langfuse datasetů nasazenou aplikací a založí experiment s deterministickými skóre
- Bezpečnost: vlastní tabulka uživatelů s aplikačními rolemi admin/editor/viewer, hesla scryptem, podepsaná HMAC cookie a volitelné SSO přes OIDC; přístup k obsahu se dá omezit štítky dokumentů. Detaily a vědomé kompromisy viz [ARCHITECTURE.md, sekce 6](docs/ARCHITECTURE.md#6-bezpečnost)

## Osobní údaje a GDPR

Jakmile chatbot sbírá kontakty a hodnocení, pracuje s osobními údaji — bez ohledu na obor: kontakt v poptávce, text hodnoceného dotazu, shrnutí konverzace pro zpracovatele. Ochrana osobních údajů proto není doplněk, ale podmínka nasazení — Kecalo má odpovídající nástroje zabudované, ne přilepené dodatečně.

**Co je zabudováno**

- **Omezená doba uložení** — retenční lhůty pro poptávky i hodnocení se nastavují za běhu v `/admin/privacy`; úklid běží denním cronem (3:00) a jde spustit i ručně. Po nasazení je **vypnutý**: mazání je nevratné, takže se zapíná vědomým rozhodnutím správce.
- **Vyřízení žádosti subjektu na jednom místě** — vyhledání podle e-mailu nebo telefonu, export do JSON (právo na přístup a přenositelnost) a trvalý výmaz včetně hodnocení navázaného přes session konverzace. Telefon se najde i v jiném zápisu, než v jakém byl uložen.
- **Doložitelnost** — každý úklid i výmaz zapíše řádek do auditní tabulky. Místo kontaktu nese jen klíčovaný otisk, aby evidence o výmazech sama nebyla dalším zpracováním osobních údajů.
- **Transparence, která nemůže zastarat** — veřejné zásady na `/privacy` čtou doby uchování z nastavení aplikace, ne z ručně opsaného textu. Odkaz je v patičce chatu i widgetu, souhlas u poptávky nese účel, správce i poučení o odvolatelnosti.
- **Minimalizace** — konverzace se neukládá na server, obsah dotazů se do telemetrie ve výchozím stavu neposílá, aplikace nepoužívá cookies ani analytiku.
- **Řízení přístupu k obsahu** — štítky dokumentů omezují, kdo uvidí které pasáže. Podstatné ve chvíli, kdy znalostní báze obsahuje údaje klientů.

**Co se ukládá**

| Údaj | Právní titul | Doba uchování |
|---|---|---|
| Poptávka (jméno, e-mail, telefon, poznámka) | souhlas | dle nastavení, výchozí 24 měsíců od poslední interakce |
| Shrnutí konverzace u poptávky | souhlas | spolu s poptávkou |
| Hodnocení odpovědi včetně textu dotazu | oprávněný zájem | dle nastavení, výchozí 6 měsíců |
| Konverzace v chatu | — | neukládá se na server |
| Provozní telemetrie (latence, počty tokenů) | oprávněný zájem | dle nastavení projektu v Langfuse |

**Co zůstává na provozovateli**

Aplikace dodává nástroje, soulad s GDPR je ale vždy závěr o konkrétním nasazení konkrétního správce. Před ostrým provozem je potřeba:

- vyplnit identifikaci správce, kontaktní e-mail a regiony Supabase i Langfuse — na `/privacy` jsou zatím jako viditelné texty `DOPLNIT`
- nechat texty zásad a souhlasu zkontrolovat právníkem; jde o funkční draft, ne o právní stanovisko
- uzavřít zpracovatelské smlouvy (Anthropic, Voyage, Mistral, Supabase, Langfuse, Vercel) a nastavit retenci v projektu Langfuse
- nastavit `CRON_SECRET` v prostředí a zapnout retenci v `/admin/privacy`
- dokončit zbývající etapy E–G plánu: minimalizace toku dat ven, provozní dokumentace a rozlišení veřejného a interního režimu

Technické detaily: [ARCHITECTURE.md, sekce 6.1](docs/ARCHITECTURE.md#61-osobní-údaje-a-retence) · postup a rozhodnutí: [docs/plans/gdpr_plan.md](docs/plans/gdpr_plan.md)

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

3. **Aplikovat DB migrace** (`supabase/migrations/001`–`019`):
   ```bash
   supabase db push --db-url "$DATABASE_URL"
   ```

4. **Spustit dev server:**
   ```bash
   npm run dev
   ```

5. **Otevřít:** [http://localhost:3000](http://localhost:3000) (chat) · [http://localhost:3000/admin](http://localhost:3000/admin) (admin) · [http://localhost:3000/demo](http://localhost:3000/demo) (demo stránka s widgetem)

6. **Naplnit znalostní bázi:** nahrát PDF z `docs/seed-docs/` přes `/admin/documents`.

## Příkazy

| Příkaz | Účel |
|---|---|
| `npm run dev` | Dev server na `localhost:3000` |
| `npm run build` | Produkční build |
| `npm run lint` | ESLint |
| `npm run eval` | Eval runner — prožene Langfuse datasety nasazenou aplikací a založí experiment (viz [docs/evaluation/](docs/evaluation/)) |

## Proměnné prostředí

| Proměnná | Účel |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API (chat) |
| `VOYAGE_API_KEY` | Voyage AI embeddingy |
| `MISTRAL_API_KEY` | Mistral (shrnutí poptávek; bez klíče se lead uloží bez shrnutí) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase projektu |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin klíč Supabase (pouze server) |
| `DATABASE_URL` | Postgres connection string (pro migrace) |
| `ADMIN_EMAIL` | E-mail prvního uživatele — jen pro `scripts/seed-admin-user.mjs`, aplikace ho za běhu nečte |
| `ADMIN_PASSWORD` | Heslo prvního uživatele (min. 12 znaků) — dtto |
| `ADMIN_FIRST_NAME` / `ADMIN_LAST_NAME` | Jméno a příjmení prvního uživatele (volitelné) |
| `SESSION_SECRET` | Podpisový klíč admin session cookie (dlouhý náhodný řetězec, např. `openssl rand -hex 32`) |
| `OIDC_ISSUER` | URL firemního IdP — bez něj se SSO vůbec nenabídne (volitelné) |
| `OIDC_CLIENT_ID` | Client ID aplikace registrované u IdP |
| `OIDC_CLIENT_SECRET` | Client secret (pouze server) |
| `OIDC_GROUPS_CLAIM` | Název claimu se skupinami (volitelné, default `groups`) |
| `OIDC_REDIRECT_BASE_URL` | Základ redirect URI, když se origin liší od veřejné adresy (volitelné) |
| `CRON_SECRET` | Secret retenčního cronu (`/api/cron/retention`); bez něj routa vrací 503 — raději vypnutý úklid než veřejná mazací routa |
| `PRIVACY_HASH_SECRET` | Klíč otisku kontaktu v auditní tabulce (volitelné — bez něj se odvodí ze `SESSION_SECRET`) |
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

## Známá omezení

Aplikace zatím není určená pro ostrý provoz — několik vědomých kompromisů (detaily viz [ARCHITECTURE.md, sekce 10](docs/ARCHITECTURE.md#10-známá-omezení)):

- **Bez automatizovaných testů** — ověřování je manuální (build, lint, E2E průchody, eval runner nad datasety). Před ostrým provozem je to první věc k doplnění.
- **Autentizace** — vlastní tabulka uživatelů s aplikačními rolemi (admin/editor/čtenář), správa v `/admin/users`, podepsaná HMAC cookie a volitelné SSO přes OIDC. SSO je ověřené jen proti lokálnímu mock IdP — napojení na reálný tenant zbývá. Chybí obnova zapomenutého hesla bez admina. Dokumenty lze omezit štítky, ale koncoví tazatelé chatu se nepřihlašují, takže omezení chrání obsah hlavně před veřejností.
- **Značka natvrdo v kódu** — obor ani obsah nejsou v architektuře nijak zadrátované, ale název „Pojišťovna Jistota" a logo žijí přímo v komponentách (`layout.tsx`, `page.tsx`, `ChatMessages.tsx`, `ChatWidget.tsx`, `demo/page.tsx`, `privacy/page.tsx`). Nasazení pro jiného zákazníka je tak zatím úprava kódu, ne konfigurace. Výchozí systémový prompt je navíc psaný pro pojišťovnictví — přepsat ho jde za běhu v `/admin/parameters/prompts`.
- **Osobní údaje** — retenční mazání je nasazené, ale po migraci **vypnuté**, a zásady zpracování mají nevyplněná místa `DOPLNIT` (identifikace správce). Obojí je vědomý stav, ne opomenutí — podrobnosti a zbývající kroky v sekci [Osobní údaje a GDPR](#osobní-údaje-a-gdpr).
- **In-memory rate limity** — per-instance; na serverless škálování napříč instancemi nedrží globální stropy přesně.
- **Vědomě odloženo (SEC-7 / SEC-8)** — serverová rekonstrukce historie chatu a explicitní CSRF token.
- **Deduplikace leadů** — podle přesné shody kontaktu v rámci typu; nepokrývá varianty zápisu.
- **Náklady modelů v Langfuse** — `voyage-3.5` a `mistral-small-latest` je třeba definovat v Langfuse Settings → Models, jinak se cena počítá jako 0.
- **Zpětná vazba na dvou místech** — hlas se ukládá do Supabase (zdroj pravdy) i do Langfuse; zápis do Langfuse je fail-open, takže při jeho výpadku data dočasně divergují.

## Dokumentace

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — technický popis: architektura, RAG pipeline, datový model, API, bezpečnost
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — prováděcí checklist projektu (fáze 0–17 + průběžný stav)
- [docs/sso-setup.md](docs/sso-setup.md) — návod na zapnutí SSO ve firemní síti
- [docs/PRD_pojistovaci_RAG_chatbot.md](docs/PRD_pojistovaci_RAG_chatbot.md) — zadání/PRD
- [docs/plans/](docs/plans/) — feature a experimentální plány (Langfuse, poptávky, Mistral, widget, demo, role a přístup k dokumentům, GDPR)
- [docs/reviews/](docs/reviews/) — nálezy a opravné plány z code/security revizí
- [docs/evaluation/](docs/evaluation/) — testovací otázky a Langfuse datasety
- [docs/seed-docs/](docs/seed-docs/) — PDF dokumenty pro znalostní bázi
