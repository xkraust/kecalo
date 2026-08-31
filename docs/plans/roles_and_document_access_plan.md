# Plán: role uživatelů a řízení přístupu k dokumentům

**Stav:** etapa A hotová a E2E ověřená (31. 8. 2026), etapy B–D neimplementované. Mimo číslované fáze; navazuje na produkční dluh „Autentizace a role" z `docs/IMPLEMENTATION_PLAN.md`.

---

## 1. Proč

Výchozí stav před etapou A byl jednoidentitní prototyp:

- jméno a heslo byly konstanty z env (`config.adminUsername`, `config.adminPassword`),
- session cookie `ts.nonce.sig` nenesla žádného nositele identity,
- autorizace byla binární „přihlášen / nepřihlášen" (`requireAdmin()`),
- chat je zcela anonymní (`POST /api/chat` je veřejná routa),
- `match_chunks` filtruje jen podle `documents.status = 'ready'` (`supabase/migrations/007_chunk_sections.sql`).

První tři body **řeší hotová etapa A** (tabulka `users`, cookie v2 s `uid`,
`requireAppRole`); poslední dva zůstávají a jsou předmětem etapy C.

Důsledek: **kdokoli, kdo se dostane k chatu, vidí obsah všech nahraných dokumentů**, a kdokoli zná jedno heslo, může mazat znalostní bázi i přepisovat systémový prompt. Pro pojišťovnu, která má vedle veřejných pojistných podmínek i interní metodiku, je to blokující omezení.

Cílem je rozdělit dnešní jedno oprávnění na dvě nezávislé otázky — *co smíš dělat* a *co smíš vidět* — a připravit půdu pro firemní SSO, aniž by se kvůli němu muselo migrovat schéma podruhé.

## 2. Tři vrstvy

Slovo „role" se v této oblasti používá pro tři různé věci. Návrh je proto pojmenovává odděleně a důsledně:

| Vrstva | Otázka | Hodnoty | Nese | Kde působí |
|---|---|---|---|---|
| **Aplikační role** | *Co smíš dělat?* | `admin` / `editor` / `viewer` | uživatel (právě jedna) | admin sekce, admin API |
| **Pracovní role** | *Kdo jsi v organizaci?* | ředitel, vedoucí účtárny, … | uživatel (M:N) | odvození štítků |
| **Štítek publika** | *Komu obsah patří?* | Právní oddělení, Obchod, Účtárna, … | pracovní role + dokument | retrieval, výpisy |

Názvy štítků i pracovních rolí se vedou **česky, s diakritikou**; technické kódy (`pravni-oddeleni`, `obchod`, `uctarna`) si aplikace odvozuje sama — viz „Životní cyklus štítku" v kap. 4.

Obě osy jsou ortogonální: vedoucí účtárny může být `viewer` i `editor`, aniž by to změnilo, které dokumenty vidí.

**Efektivní štítky uživatele = sjednocení štítků všech jeho pracovních rolí.** Jiná cesta ke štítku neexistuje — uživatel nemá vlastní přiřazené štítky. Výhoda je auditovatelnost: oprávnění se mění na jednom místě (v roli) a nikde nevzniká tiše přiživená individuální výjimka, na kterou se po roce zapomene. Cena je, že jednorázová výjimka („je z obchodu, ale tři týdny potřebuje právní") vyžaduje založit roli — vědomý kompromis ve prospěch přehlednosti.

Aplikační role `admin` má implicitně všechny štítky — jinak by správce nemohl spravovat obsah, který nevidí. Vědomé rozhodnutí, ne opomenutí.

**Vedlejší přínos pro SSO:** skupina z OIDC claims se mapuje na **pracovní roli**, tedy jedna vazba místo rozpadu na N štítků. Proto `external_group` patří na `job_roles`, ne na `audiences`.

## 3. Rozsah aplikačních rolí

Vodicí věta: **editor spravuje obsah a agendu, ne systém a ne oprávnění.**

| Akce | `viewer` | `editor` | `admin` |
|---|---|---|---|
| Seznam dokumentů, test retrievalu, čtení RAG parametrů | ✓ (své štítky) | ✓ (své štítky) | ✓ (vše) |
| Nahrát / smazat / reindexovat dokument | — | ✓ | ✓ |
| Převzít / uzavřít poptávku | — | ✓ | ✓ |
| Přiřadit dokumentu štítky | — | ✓ jen ze svých efektivních štítků | ✓ libovolné |
| Přepnout dokument na `public` | — | — | ✓ |
| Změnit RAG parametry, telemetrii, chunkování, **prompty** | — | — | ✓ |
| Spravovat uživatele, pracovní role a číselník štítků | — | — | ✓ |

Dvě hranice, které nejsou samozřejmé a je třeba je držet:

- **Prompty nejsou obsah.** Systémový prompt řídí chování bota vůči klientům pojišťovny — je blíž konfiguraci systému než nahrání dokumentu, proto zůstává adminovi i přes `POST /api/settings`.
- **Zveřejnění je udělení oprávnění.** Přepnutí `restricted → public` zpřístupní dokument anonymnímu chatu; svou povahou to není správa obsahu. Editor proto smí přiřazovat pouze štítky, které sám efektivně má (nemůže zpřístupnit obsah oddělení, kam nepatří), ale `public` nastavuje jen admin. Práce běží bez fronty na admina a eskalace nad vlastní úroveň není možná.

## 4. Datový model

Navazuje na stávající `013_prompt_settings.sql`. Rozdělené na dvě migrace podle etap.

### `014_users_roles.sql`

Vyžaduje `create extension if not exists citext;`

```sql
users (id uuid PK, username citext UNIQUE, display_name text,
       app_role text NOT NULL DEFAULT 'viewer'
                CHECK ('admin'/'editor'/'viewer'),          -- aplikační role
       auth_provider text CHECK ('local'/'oidc') DEFAULT 'local',
       password_hash text NULL,                             -- jen local
       external_issuer text NULL, external_subject text NULL,  -- jen oidc
       is_active boolean DEFAULT true,
       sessions_invalid_before timestamptz DEFAULT epoch,   -- per-user revokace
       created_at, updated_at)
  CHECK (auth_provider='local' AND password_hash IS NOT NULL
      OR auth_provider='oidc'  AND external_subject IS NOT NULL)
  UNIQUE (external_issuer, external_subject)
```

Sloupec se jmenuje `app_role`, ne `role` — `role` je v Postgresu vyhrazené slovo a v kódu by se pletlo s `role` u chatových zpráv (`parseMessages` v `src/app/api/chat/route.ts`).

`DEFAULT 'viewer'` je **bezpečnostní default zakotvený ve schématu**, ne jen v aplikačním kódu: nově založený uživatel — z admin UI i JIT provisioningem při SSO (etapa D) — dostane nejnižší oprávnění i tehdy, když ho zakládající kód opomene nastavit. Vyšší roli musí někdo přidělit vědomě. Jediná výjimka je seed skript, který u prvního uživatele nastavuje `admin` explicitně.

### `015_job_roles_audiences.sql`

```sql
audiences  (code text PK, label text NOT NULL, created_at)
job_roles  (code text PK, label text NOT NULL, description text NULL,
            external_group text NULL,     -- budoucí mapování skupin z OIDC claims
            created_at)
job_role_audiences (job_role_code FK→job_roles ON DELETE CASCADE,
                    audience_code FK→audiences ON DELETE RESTRICT, PK obojí)
user_job_roles     (user_id FK→users ON DELETE CASCADE,
                    job_role_code FK→job_roles ON DELETE CASCADE, PK obojí)
document_audiences (document_id FK→documents ON DELETE CASCADE,
                    audience_code FK→audiences ON DELETE RESTRICT, PK obojí)
documents += visibility text CHECK ('public'/'restricted') DEFAULT 'public'
```

**Asymetrie `CASCADE` vs. `RESTRICT` je záměrná, ne nedůslednost.** Zaniká-li dokument, uživatel nebo pracovní role, ztrácí jejich vazby smysl → `CASCADE`. Štítek je ale číselníková položka přilepená na **cizím obsahu**: kdyby se mazal kaskádou, jedno smazání v číselníku by tiše odebralo označení ze všech dokumentů a rolí. Proto `RESTRICT` — smazat jde jen nepoužitý štítek.

Žádná tabulka `user_audiences` — přímá vazba uživatel↔štítek by obešla pracovní role a rozbila jediný zdroj pravdy.

### Životní cyklus štítku

**Štítky se udržují česky.** `label` je plnohodnotný český název s diakritikou („Právní oddělení", „Účtárna") — je to jediná hodnota, kterou kdokoli v adminu vidí a čte, a nemá žádné omezení kromě délky. Totéž platí pro názvy pracovních rolí.

`code` je proti tomu technická vodoznak pro URL, SQL a primární klíč — **negeneruje ho uživatel, ale aplikace transliterací z názvu**: „Právní oddělení" → `pravni-oddeleni`. Při zakládání se předvyplní jako návrh, který jde přepsat; po uložení už ne. Admin tak nikde nemusí vymýšlet anglické ani bezdiakritické názvy.

Důvod, proč `code` zůstává ASCII, není purismus: „č" jde v Unicode zapsat dvěma způsoby (NFC jedním znakem, NFD jako `c` + kombinující háček). Vizuálně shodné, bajtově různé — a protože je `code` primární klíč, vznikly by dva různé štítky, které na obrazovce vypadají identicky. K tomu case-insensitivita (`Č` vs `č`) a kódování v URL. Transliterace tenhle problém odstraňuje celý, aniž by kohokoli nutila psát nečesky.

- **`code` je po založení neměnný.** Je primárním klíčem ve dvou vazebních tabulkách, takže přejmenování by byl update PK s kaskádou. **Přejmenovat štítek ale jde kdykoli** — `label` je volně editovatelný a v UI se mění právě on; kód pod ním zůstává. Rozejde-li se časem slug s názvem, nevadí to (je interní).
- **Validace kódu:** `^[a-z0-9_-]{2,32}$` po transliteraci — vynutit v API, ne jen v UI. Kolize slugu (dva různé názvy dají stejný kód) → API vrátí srozumitelnou chybu a nabídne číslovanou variantu.
- **Smazání projde jen u nepoužitého štítku.** Odebrání ze všech dokumentů a rolí je samostatný vědomý krok, ne vedlejší efekt mazání.
- **Pozor na osiření dokumentu:** odebrání štítku, který je jediným štítkem `restricted` dokumentu, promění dokument v neviditelný pro všechny kromě admina. Je to týž stav, který kap. 8 značí badge „bez štítků" — jenže tady vzniká tiše a u cizího dokumentu, ne viditelně při vlastním uploadu. Potvrzovací dialog na to musí upozornit jménem dotčeného dokumentu.

Pomocný view, ať se dvojitý join neopakuje v každém dotazu a ať jde odpovědět „**proč** tenhle uživatel na dokument vidí" (u M:N to není triviální otázka):

```sql
create view user_effective_audiences as
  select ujr.user_id, jra.audience_code, ujr.job_role_code
  from user_job_roles ujr
  join job_role_audiences jra on jra.job_role_code = ujr.job_role_code;
```

Sloupec `job_role_code` ve view je záměrný — nese původ štítku, což admin UI potřebuje pro vysvětlení a audit.

Nové tabulky s `ENABLE ROW LEVEL SECURITY` bez policy — stejný vzor jako `010`/`011` (app jede přes service-role klíč).

`DEFAULT 'public'` u `documents.visibility` platí **jen pro migraci stávajících řádků**: nasazení nesmí skokem zneviditelnit dnešní bázi ani rozbít eval runner. Stejná logika jako `DEFAULT epoch` v `011_auth_state.sql`.

**Pozor — SQL default a viditelnost nově nahraného dokumentu jsou dvě různé věci.** Upload routa (`POST /api/documents`) nastavuje viditelnost explicitně, podle provozního režimu (viz níže) — spoléhat se na `DEFAULT 'public'` by znamenalo, že editor uploadem rovnou zveřejní interní materiál.

### Provozní režim: veřejná vs. interní znalostní báze

Kecalo se provozuje ve dvou velmi odlišných režimech a **výchozí viditelnost nahraného dokumentu musí sledovat ten režim, ne pevnou konstantu v kódu**:

- **Plně veřejná aplikace** (dnešní hlavní use-case — chatbot pojišťovny na `/` a `/demo`): koncoví uživatelé se nikdy nepřihlašují, celá báze je veřejná. Kdyby byl upload natvrdo `restricted`, přestal by veřejný bot znát každý nově nahraný dokument, dokud ho admin ručně nepřepne — u báze, kde nic interního neexistuje, je to jen tření navíc.
- **Interní znalostní báze**: většina dokumentů je omezená a `restricted` je jediný bezpečný default.

Řešení je runtime přepínač, konzistentní s tím, jak projekt už spravuje RAG parametry a prompty:

```sql
app_settings += default_document_visibility text NOT NULL DEFAULT 'public'
                CHECK (default_document_visibility in ('public', 'restricted'))
```

Upload routa čte hodnotu přes `getSettings()` (stejně jako už čte parametry chunkování) a použije ji pro nový dokument. Přepínač patří do `/admin/parameters` mezi ostatní runtime nastavení, mění ho jen `admin` a v UI musí být doprovozený vysvětlením, co znamená — je to jediné nastavení v celém adminu, které rozhoduje o tom, zda se obsah dostane k anonymnímu návštěvníkovi.

`DEFAULT 'public'` v migraci je zvolený tak, aby **nasazení nezměnilo chování stávajícího provozu**; kdo Kecalo provozuje interně, přepne si ho jednou po nasazení.

### Přihlášení koncového uživatele v chatu

**Chat zůstává čistě veřejný a anonymní — vědomé rozhodnutí, ne opomenutí.** Na `/` ani ve widgetu není a v etapách A–C nebude žádný login pro koncové uživatele. Filtr štítků se tak v praxi uplatní jen u návštěvníka, který už přihlášený je (správce se session z administrace).

Důvod: samostatný login pro tazatele má smysl teprve tehdy, až se lze přihlásit firemní identitou. Vlastní heslo do chatbota by si nikdo nezakládal a spravovat druhou sadu hesel pro čtenáře je horší než nemít omezení vůbec. **Interní chat se proto otevře až s SSO v etapě D** — tam přihlášení stojí na účtu, který zaměstnanec už má.

Praktický důsledek pro etapu C: viditelnost dokumentů je do etapy D funkční hlavně jako **ochrana obsahu před veřejností** (co je `restricted`, veřejný bot neuvidí), ne jako rozlišení mezi odděleními v chatu. Rozlišení podle štítků je do té doby vidět hlavně v administraci — ve výpisu dokumentů a v testu retrievalu.

`auth_state` **zůstává, ale mění roli: už jen ruční kill-switch pro incident, ne běžná cesta.** Dnešní logout volá `revokeAllSessions()` a posouvá globální hranici — s více uživateli by tak **kterýkoli viewer odhlásil i všechny adminy**. Logout routa proto musí přejít na per-user revokaci: posune `sessions_invalid_before` jen u odhlašovaného uživatele. Per-user razítko posouvá i deaktivace účtu, změna sady rolí a reset hesla adminem (ukradená session nesmí přežít reset).

**Uživatelé se nemažou, jen deaktivují** (`is_active = false`) — stejný vzor jako u poptávek. Drží to integritu budoucího navázání `leads.assignee` a auditní stopu; skutečné mazání patří do GDPR retenčních procesů (kap. 11).

## 5. Autentizace

### Bootstrap prvního admina

Migrace nemůže hashovat heslo v SQL. Založit skript `scripts/seed-admin-user.mjs` (vzor existujících `scripts/*.mjs`), který z `ADMIN_USERNAME`/`ADMIN_PASSWORD` vytvoří prvního uživatele s `app_role='admin'`. Skript je idempotentní — existující účet nezaloží podruhé a heslo nepřepíše bez explicitního `--force`.

Explicitně **nedělat** lazy bootstrap při loginu — tichý fallback na env údaje je přesně ta cesta, kterou pak nikdo neodstraní a která přežije do produkce jako zadní vrátka. Po migraci zůstane `ADMIN_USERNAME`/`ADMIN_PASSWORD` v `.env.example` jen pro seed, ne pro běhové ověřování.

### Hesla a session

- **Hash:** `scrypt` z `node:crypto` (žádná nová závislost, běží na Vercelu), náhodná sůl, formát `scrypt$N$r$p$salt$hash`, porovnání `timingSafeEqual`. Nový `src/lib/password.ts`.
- **Timing při neexistujícím uživateli:** login pro neznámé `username` provede dummy scrypt ověření proti fixnímu hashi, aby doba odpovědi neprozrazovala existenci účtu — konzistentní s dnešní `safeEqual` filozofií. Ověřuje se i `is_active`.
- **Samoobslužná změna hesla v návrhu není** — heslo resetuje admin. Vědomý odklad (jde o interní nástroj s jednotkami uživatelů), ne opomenutí; doplnit až s reálnou potřebou.
- **Cookie v2:** `v2.ts.uid.nonce.sig`, podepsaná stejným HMAC jako dnes (`src/lib/auth.ts`). Starý tříčlenný formát **odmítnout** — jediný dnešní admin se jednorázově přihlásí znovu.
- **Aplikační role ani štítky se do cookie nedávají.** Čtou se z DB per request, aby odebrání oprávnění platilo okamžitě a cookie nebyla zdrojem pravdy. Cena je jeden `select` navíc — v requestu, který už dělá `getSettings()` i `isSessionRevoked()`, zanedbatelná.
- Nový `src/lib/session-user.ts` → `getSessionUser(): Promise<SessionUser | null>` vrací `{ id, username, appRole, audiences, isActive }`, kde `audiences` je sjednocení z `user_effective_audiences`. Kontroluje per-user i globální revokaci a nahrazuje přímé volání `isSessionRevoked` v `require-admin.ts` a v admin layoutu.

### Autorizace v handlerech

`requireAdmin()` se rozšíří na `requireAppRole(min)` se stejným kontraktem (vrací `null`, nebo hotovou 401/403 odpověď) — komentář o druhé obranné linii SEC-2 platí dál. Volání zůstane jednořádkové na začátku všech 8 handlerů:

| Routa | Minimální aplikační role |
|---|---|
| `GET /api/documents`, `POST /api/retrieval-test`, `GET /api/settings` | `viewer` |
| `POST /api/documents`, `DELETE /api/documents/[id]`, **`PATCH /api/documents/[id]`** (nový — viditelnost + štítky, s kontrolou invariantu 6; `public` jen admin), `.../reprocess`, `PATCH /api/leads/[id]` | `editor` |
| `POST /api/settings` (vč. promptů), `/api/users*`, `/api/job-roles*`, `/api/audiences*` | `admin` |

`PATCH /api/documents/[id]` je jediný nový zápisový endpoint pro dokumenty — UI editace viditelnosti a chipů štítků (kap. 8) jinak nemá kam zapisovat.

Proxy (`src/proxy.ts`): **logika zůstává beze změny** — v edge runtimu nemá do DB přístup, takže dál ověřuje jen podpis a expiraci; roli a revokaci řeší Node vrstva. **Matcher se ale rozšířit musí:** nové routy `/api/users*`, `/api/job-roles*`, `/api/audiences*` v dnešním výčtu nejsou a bez doplnění by pro ně `requireAppRole()` nebyl druhou obrannou linií, ale jedinou — přesně stav, který opravovala SEC-2. (`PATCH /api/documents/[id]` je pokrytý stávajícím vzorem `/api/documents/:path*`.) Tato dělba je nejčastější místo na chybu.

## 6. Viditelnost dokumentů v retrievalu

`match_chunks` dostane parametr `caller_audiences text[] DEFAULT '{}'`. Migrace `015` funkci opět dropne a vytvoří znovu — poznámka o změně návratového typu z `007_chunk_sections.sql` platí i pro změnu signatury.

```sql
where documents.status = 'ready'
  and (documents.visibility = 'public'
       or exists (select 1 from document_audiences da
                  where da.document_id = documents.id
                    and da.audience_code = any(caller_audiences)))
  and 1 - (chunks.embedding <=> query_embedding) > match_threshold
```

`retrieve()` (`src/lib/rag/retrieve.ts`) dostane čtvrtý parametr `audiences: string[] = []` a předá ho do RPC. Volají ho dvě místa: `api/chat/route.ts` a `api/retrieval-test/route.ts`.

`/api/chat` **zůstává veřejná routa** — jen si volitelně přečte session přes `getSessionUser()`. Anonym → `[]` → vidí pouze `public`. Přihlášený → svoje efektivní štítky. Žádná nová veřejná routa, žádná nová útočná plocha; widget a `/demo` fungují beze změny.

**Mechanika admin bypassu:** admin „má všechny štítky" se **nesmí** implementovat vyjmenováním všech kódů z číselníku (rozjelo by se s nově přidaným štítkem mezi requesty). Místo toho `getSessionUser()` u admina nastaví příznak a volající předá `caller_audiences := NULL`; `match_chunks` interpretuje `NULL` jako „bez filtru viditelnosti" (`'{}'` dál znamená „jen public"). Rozlišení NULL vs. prázdné pole je záměrné a musí být v SQL komentáři funkce.

## 7. Bezpečnostní invarianty

1. **Štítky tazatele se odvozují výhradně serverově ze session** — nikdy z těla požadavku, query parametru ani hlavičky. Kdyby šly poslat z klienta, celá funkcionalita je jen dekorace.
2. **Filtr je v SQL, ne v JS** — stejný princip jako dnešní práh podobnosti. Chunk, který uživatel nesmí vidět, se nesmí dostat ani do paměti procesu.
3. **`/api/retrieval-test` musí filtrovat stejně jako chat**, jinak je z něj obcházečka omezení pro roli `viewer`.
4. `X-Sources` se skládá až z chunků, které prošly filtrem → neuniká.
5. **`app_role='admin'` obchází filtr štítků** — vědomé rozhodnutí.
6. **Editor nesmí přiřadit štítek, který nemá ve svých efektivních štítcích, ani nastavit `public`** — kontrolovat serverově proti session, ne skrytím prvku v UI. Jinak je omezení obejitelné přímým voláním API.
7. **Smazání pracovní role odebírá přístup okamžitě.** `ON DELETE CASCADE` na `user_job_roles` znamená, že smazání role tiše odebere štítky všem nositelům — správné chování, ale admin UI musí upozornit s počtem dotčených uživatelů. Zároveň to musí posunout jejich `sessions_invalid_before`.
8. **SSO uživatel se nesmí přihlásit heslem.** Login lokálním heslem musí pro `auth_provider='oidc'` selhat, i kdyby se do `password_hash` cokoli dostalo — jinak vznikne cesta okolo IdP, která obchází MFA i deaktivaci účtu po odchodu ze zaměstnání. Nastavit heslo takovému uživateli nesmí jít ani z admin UI.
9. **Login rate limit se musí přenavrhnout.** Dnešní globální strop 30 selhání / 15 min napříč IP (`api/auth/login/route.ts`) stojí na předpokladu „jediný admin účet" — je to i v komentáři u konstanty. S více uživateli je to DoS vektor: útočník uzamkne přihlášení všem. Náprava: **per-username** limit 5/15 min vedle stávajícího per-IP, globální strop ponechat, ale výrazně zvýšit jako pojistku poslední instance.
10. **Každá změna efektivních štítků uživatele revokuje jeho session.** Invariant 7 řeší jen smazání pracovní role, ale tentýž dopad má i změna sady jejích štítků a odebrání role uživateli — nositelé okamžitě získají nebo ztratí přístup k obsahu. Všechny tři operace musí posunout `sessions_invalid_before` dotčených a UI musí předem ukázat počet zasažených lidí.
11. **Nelze deaktivovat ani degradovat posledního aktivního admina.** Admin může měnit role a deaktivovat účty — včetně svého. Bez této pojistky si organizace jedním kliknutím zamkne správu systému (a bez samoobslužné eskalace by ji odemykal jen zásah do DB). Kontrolovat serverově v `PATCH /api/users/[id]`, ne jen v UI.

## 8. Admin UI

- Nová položka sidebaru **Uživatelé** (ikona `Users`), viditelná jen pro `admin`, jako rozbalitelná skupina — vzor dnešních „Parametrů" v `src/components/AdminSidebar.tsx`:
  - `/admin/users` — tabulka (jméno, aplikační role, pracovní role, stav), založit / deaktivovat / reset hesla, multiselect pracovních rolí. Reset hesla i deaktivace posunou `sessions_invalid_before` uživatele (kap. 4). U uživatele zobrazit **odvozené štítky read-only** s uvedením role, ze které plynou (`user_effective_audiences.job_role_code`) — jinak není u M:N poznat, proč někdo na co vidí. V etapě B existuje stránka jen se sloupci aplikační role a stavu; sloupec pracovních rolí přibude v etapě C.
  - `/admin/users/job-roles` — pracovní role: kód, název, popis, multiselect štítků, počet nositelů.
  - `/admin/users/audiences` — číselník štítků: sloupce **Název · Kód · Použití** (počet dokumentů + počet rolí). Název je hlavní sloupec a je česky; kód se při zakládání předvyplňuje transliterací a po uložení je read-only (kap. 4). Tlačítko smazat je **disabled u použitého štítku** a říká, kde se používá — bez toho vypadá `RESTRICT` z kap. 4 jako rozbitá aplikace. Proklik z počtu použití na filtrovaný seznam dokumentů je volitelný.
- `AdminSidebar` je klientská komponenta, aplikační roli tedy musí dostat propem z admin layoutu (server), který uživatele stejně načítá. Skrytí položky je kosmetika — autorizace drží na routách.
- `/admin/documents` — nový sloupec **Viditelnost** (badge, vzor `StatusBadge.tsx`) a editace štítků jako chipy (zapisuje `PATCH /api/documents/[id]`). Výpis filtrovat podle efektivních štítků uživatele (admin vidí vše). `restricted` dokument **bez štítků** je legální mezistav po uploadu (nevidí ho nikdo kromě admina) — značit ho badge „bez štítků", jinak bude vypadat jako záhada „proč chat nevidí, co jsem nahrál".

Vzor server `page.tsx` + klient `client.tsx` jako u `documents/`.

## 9. SSO / OIDC

**Každý SSO uživatel má v Kecalu vlastní řádek v `users`** — ale nezakládá ho nikdo ručně, vzniká sám při prvním přihlášení (JIT provisioning).

Důvod, proč lokální řádek musí existovat: IdP ví, *kdo* člověk je, ale nic neví o aplikačních ani pracovních rolích. Ty potřebují cizí klíč, na který se navěsí `user_job_roles`; stejné `user_id` využívá per-user revokace session a časem i dnes volný textový `leads.assignee`. Řádek je tedy **stín identity, ne kopie účtu** — heslo, MFA, reset ani expirace v Kecalu nejsou (`password_hash` je `NULL`, hlídá to `CHECK` z migrace `014`).

Průběh přihlášení:

1. Redirect na IdP, ověření tam (včetně MFA).
2. Z claims se čte `iss`, `sub`, `email`, `name`, `groups`.
3. Vyhledání `users` podle **`(external_issuer, external_subject)`** — proto je na dvojici `UNIQUE`. **Nikdy podle e-mailu:** e-mail se mění (svatba, přejmenování domény) a párování přes něj je klasická díra na převzetí účtu, když si ho někdo nastaví u jiného vydavatele.
4. Chybí-li řádek, založí se s `auth_provider='oidc'`, `app_role='viewer'` a `username` = e-mail z claims (jediný lidsky čitelný unikátní identifikátor, který claims nabízejí). Kolize s existujícím účtem → srozumitelná chyba loginu, ne tiché přejmenování. Změna e-mailu v IdP se do `username` propíše při dalším loginu — **identita stojí na `(iss, sub)`, username je jen zobrazované jméno účtu**. Existuje-li řádek, aktualizuje se `display_name` (a případně `username`).
5. `groups` se přes `job_roles.external_group` přeloží na pracovní role a `user_job_roles` se přepíše podle claims.
6. Vydá se obvyklá cookie v2 `v2.ts.uid.nonce.sig`. Od tohoto bodu je zbytek aplikace na způsobu přihlášení nezávislý — `getSessionUser()`, `requireAppRole()` ani `match_chunks` rozdíl nepoznají. To je hlavní důvod, proč cookie nese jen `uid` a žádné role.

Prakticky se v Kecalu předem zakládají **pracovní role** a mapují na názvy skupin v IdP; uživatelé se pak objevují sami, jak se přihlašují.

Dvě rozhodnutí, která z toho plynou:

- **IdP je zdrojem pravdy pro pracovní role.** Každý login přepíše `user_job_roles` podle aktuálních skupin. Přeložení člověka mezi odděleními se propíše samo a opuštěná oprávnění nepřežijí. Cena: SSO uživateli **nejde přidat pracovní roli ručně** — admin UI to musí u těchto uživatelů zobrazit read-only s vysvětlením, že se mění přes správu skupin, jinak bude vypadat rozbitě. Synchronizace musí posunout `sessions_invalid_before`, když se sada rolí změnila, aby jiná běžící session nedojezdila se starými oprávněními.
- **Aplikační role se z IdP nemapuje.** Nový SSO uživatel je vždy `viewer` a na `editor`/`admin` ho povýší admin v Kecalu. Chybná konfigurace skupin tak nikoho neudělá adminem a správa systému nezávisí na tom, kdo má právo zakládat skupiny v IdP. Obě osy tím zůstávají oddělené i provozně, nejen datově.

Provozní důsledek k vědomí: volbou „IdP je zdroj pravdy" se správa přístupu k dokumentům přesouvá na toho, kdo spravuje skupiny v Entra ID / Workspace. Admin v Kecalu pak rozhoduje jen o aplikačních rolích a o tom, čím jsou dokumenty označkované.

## 10. Etapy

### Etapa A — identity a aplikační role

- [x] Migrace `014_users_roles.sql` (+ `citext` extension)
- [x] `src/lib/password.ts` — scrypt hash/verify + `burnPasswordTime`
- [x] `src/lib/session-user.ts` — `getSessionUser()`, `AppRole`, `roleAtLeast`
- [x] Cookie v2 (`v2.ts.uid.nonce.sig`) v `src/lib/auth.ts`, odmítnutí starého formátu
- [x] `requireAppRole(min)` v `src/lib/require-role.ts` (přejmenováno z `require-admin.ts`) — všech 8 handlerů
- [x] Login proti tabulce `users` místo env konstant (vč. `is_active`, `auth_provider` a dummy scrypt pro neznámé username)
- [x] **Logout na per-user revokaci** (`revokeUserSessions`) místo `revokeAllSessions()` — jinak kterýkoli uživatel odhlásí všechny (kap. 4)
- [x] `scripts/seed-admin-user.mjs` (idempotentní, `--force` pro přepis hesla)
- [x] Přenavržení login rate limitu: per-username vedle per-IP (invariant 9)
- [x] Úklid osiřelého kódu: `safeEqual` v `auth.ts`, `adminUsername`/`adminPassword` v `config.ts`

Navenek se nic nemění — admin funguje jako dnes. Sidebar navíc zobrazuje jméno
přihlášeného a umí skrývat položky podle role (`minRole`), což využije etapa B.

**Provozní poznámka k nasazení:** migrace `014` sama nikoho nezaloží. Po
`supabase db push` je nutné spustit `node scripts/seed-admin-user.mjs`, jinak se
nikdo nepřihlásí. Nasazení zároveň odhlásí stávající session (cookie v1 je
odmítnuta) — to je záměr, ne regrese.

**Ověřeno E2E (31. 8. 2026):** login vydá cookie v2 (5 segmentů); cookie v1 →
401; `viewer` dostane 403 na `POST /api/settings` i `POST /api/documents` a 200
na `GET /api/documents`; `admin` projde všude; **logout jednoho uživatele
neodhlásí ostatní**; deaktivace účtu ukončí běžící session; per-username rate
limit vrací 429 nezávisle na střídání IP; seed je idempotentní.

**Známé omezení (drobné):** neexistující účet odpovídá asi o 40 ms rychleji než
existující se špatným heslem — rozdíl nepochází z hashování (`burnPasswordTime`
spálí stejný scrypt), ale z DB dotazu, který u existujícího účtu vrací řádek.
Timing enumeraci to ztěžuje, ale zcela neodstraňuje.

### Etapa B — aplikační role v UI

- [ ] Sekce `/admin/users` (server + klient), založení / deaktivace / reset hesla (obojí posouvá per-user revokaci); ochrana posledního admina (invariant 11)
- [ ] Gating rout dle tabulky v kap. 5
- [ ] Rozšíření proxy matcheru o `/api/users*`
- [ ] Sidebar podle aplikační role (prop z layoutu)

### Etapa C — pracovní role a štítky

- [ ] Migrace `015_job_roles_audiences.sql` + view `user_effective_audiences`
- [ ] Číselníky `/admin/users/job-roles` a `/admin/users/audiences` + rozšíření proxy matcheru o `/api/job-roles*` a `/api/audiences*`
- [ ] `ON DELETE RESTRICT` u `audience_code` v obou vazbách
- [ ] Transliterace názvu na kód (`Právní oddělení` → `pravni-oddeleni`) + validace `^[a-z0-9_-]{2,32}$` a ošetření kolize slugu v `/api/audiences`
- [ ] Číselník štítků s počty použití a zablokovaným mazáním použitého štítku
- [ ] Varování před osiřením `restricted` dokumentu při odebrání jeho posledního štítku
- [ ] Revokace session nositelů při změně sady štítků role a odebrání role (invariant 10)
- [ ] `PATCH /api/documents/[id]` — zápis viditelnosti a štítků (invariant 6)
- [ ] `documents.visibility` + `document_audiences` v admin UI (sloupec, chipy, badge „bez štítků")
- [ ] `app_settings.default_document_visibility` + přepínač v `/admin/parameters`; upload routa ji čte přes `getSettings()`
- [ ] `match_chunks` s `caller_audiences`, `retrieve()` se čtvrtým parametrem
- [ ] Napojení v `/api/chat` a `/api/retrieval-test`, filtrace výpisu dokumentů
- [ ] Telemetrie: `chat.audience_count`, `chat.authenticated`

### Etapa D — SSO / OIDC (odloženo)

Schéma z etap A a C ji už unese, žádná migrace dat.

- [ ] Rozpad login routy na providery (`src/lib/auth/providers/local.ts` + `oidc.ts`)
- [ ] JIT provisioning a synchronizace pracovních rolí z claims
- [ ] Read-only zobrazení pracovních rolí u SSO uživatelů v admin UI
- [ ] Volba knihovny (`openid-client`)

## 11. Dopady

- **Eval runner** `scripts/langfuse-eval.mjs` volá `/api/chat` bez cookie → po etapě C uvidí jen `public` dokumenty. Dokud seed dokumenty zůstanou `public` (což `DEFAULT` zajistí), datasety a skóre se nezmění. Jakmile se nějaký eval dokument označí `restricted`, runner potřebuje servisní přihlášení — jinak začnou falešné fallbacky a skóre spadnou bez zjevné příčiny.
- **pgvector + filtr:** HNSW index prohledává podle `ef_search` a filtr se aplikuje až na kandidáty. Při hodně restriktivních štítcích může `match_count` vrátit méně chunků, než by odpovídalo `top_k`. Při dnešní velikosti báze (stovky chunků) nehrozí; při růstu je řešením přednačíst víc kandidátů a ořezat v aplikaci.
- **Telemetrie:** na `chat-pipeline` span přidat `chat.audience_count` a `chat.authenticated` — ne samotné kódy štítků ani pracovních rolí. Umožní odlišit anonymní a interní provoz, aniž by se do trace dostala organizační struktura.
- **GDPR:** `users` je nová kategorie osobních údajů — patří do dnes odložených retenčních procesů. Provozně se účty jen deaktivují (kap. 4); skutečné mazání po uplynutí retence bude součástí GDPR procesů, až vzniknou.

## 12. Ověření

E2E scénáře pro etapu A:

1. Seed skript založí admina; opakované spuštění je idempotentní (nezaloží duplicitu, nepřepíše heslo bez `--force`).
2. Starý tříčlenný formát cookie je odmítnut (401 / redirect na login) — přihlášení vydá cookie v2.
3. Odhlášení uživatele A neodhlásí přihlášeného uživatele B; deaktivace a reset hesla ukončí běžící session dotčeného.
4. Login s neexistujícím username vrací stejnou chybu i podobnou latenci jako se špatným heslem.

E2E scénáře pro etapu C (body 1–5 předpokládají uživatele přihlášeného v administraci — do etapy D se koncoví tazatelé nepřihlašují):

1. Založit pracovní roli „vedoucí účtárny" se štítky `ucetni` + `pravni`, přiřadit ji uživateli.
2. Označit dokument `restricted` se štítkem `obchod`.
3. Cílený dotaz na obsah tohoto dokumentu → anonymní chat i tento uživatel dostanou fallback.
4. Přidat uživateli roli se štítkem `obchod` → tentýž dotaz vrátí odpověď se zdrojem.
5. Odebrat roli → dotaz se vrátí na fallback bez nutnosti odhlášení.

6. Smazání použitého štítku → **409 se srozumitelnou hláškou**, ne 500 z porušeného FK; po odebrání ze všech dokumentů i rolí smazání projde.
7. Přidání štítku k pracovní roli okamžitě zpřístupní dotčené dokumenty jejím nositelům, odebrání je stejně rychle odebere (invariant 10).
8. Štítek se založí zadáním samotného českého názvu („Právní oddělení") — kód se odvodí sám a je platný; přejmenování na „Právní a compliance" projde a kód zůstane. Kód mimo `^[a-z0-9_-]{2,32}$` je odmítnut i přímým voláním API, nejen v UI.
9. Při `default_document_visibility = 'public'` je nově nahraný dokument po zaindexování rovnou dohledatelný anonymním chatem (dnešní chování beze změny); po přepnutí na `'restricted'` tentýž upload anonymní chat nenajde a v tabulce dokumentů má badge „bez štítků".
10. Migrace `015` na existující instalaci nezmění chování veřejného chatu — všechny stávající dokumenty zůstanou `public` a eval runner běží beze změny skóre.

Dále ověřit: `viewer` nedostane 200 na `POST /api/documents`; `editor` nedostane 200 na `POST /api/settings`; editor nemůže přiřadit štítek mimo své efektivní štítky ani nastavit `public` přímým voláním API (invariant 6); uživatel s `auth_provider='oidc'` se nepřihlásí heslem (invariant 8).
