# Plán: Ochrana veřejného chatu — sdílený rate limit, denní strop útraty, allowlist originů

**Stav:** **návrh — neimplementováno.** Mimo číslované fáze. Vypracováno 7. 9. 2026, revize proti kódu 11. 9. 2026 (doplněny Předpoklady nasazení, sémantika loginu v A.3.2, eval runner v B.3.5 a C.4, `gdpr.md` v dokumentaci). Vznikl z otázek k nasazení widgetu na veřejný web (embed skript, vlastní znalostní báze, náklady a limity); tenhle plán řeší **jen třetí okruh — náklady a zneužití**.

## Návaznost na plán widgetu

Přebírá provozní podmínky, které byly původně odrážkou ve „Výhledu fáze 2" v [`widget_mini_kecalo_plan.md`](widget_mini_kecalo_plan.md) („rate limity pro cizí provoz, CORS"). Osamostatnily se ze dvou důvodů:

- **Platí i bez embedu.** `/api/chat` je veřejná už dnes a jde ji volat curlem, takže chybějící strop není budoucí problém embedu, ale současný problém provozu.
- **Fáze 2 možná nikdy nepřijde.** Držet ochranu nákladů jako její podčást by znamenalo, že se neudělá, dokud se nerozhodne o embeddovatelném widgetu.

| Etapa zde | Odpovídá bodu z fáze 2 widgetu |
|---|---|
| A — sdílený rate limit | „rate limity pro cizí provoz" |
| B — denní strop útraty | (nebylo ve výhledu; u veřejného embedu podstatnější než rate limit) |
| C — allowlist originů | „CORS pro API volání z iframe" — tentýž seznam poslouží jako CORS allowlist |

**Ve fázi 2 widgetu naopak zůstává** a tenhle plán se toho nedotýká: route `/widget`, `public/embed.js`, uvolnění `frame-ancestors` pro `/widget` (dnes globální `DENY` z opravy SEC-10) a tenant identifikace. Fáze 2 má od 7. 9. 2026 vlastní plán — [`widget_embed_plan.md`](widget_embed_plan.md); jeho sekce „Vztah k ochrannému plánu" popisuje závislost z druhé strany. Pozn.: v tam navržené architektuře jde chat z iframu **same-origin**, takže etapa C embed neomezuje a CORS allowlist pro cizí originy nakonec potřeba není.

Pořadí je proto takové, že tenhle plán dává smysl udělat **dřív** než fázi 2 — embed bez stropu útraty by veřejnou instanci vystavil přesně tomu, před čím strop chrání. Blokující je z toho jen **etapa B**; A a C jsou žádoucí, ne podmínka.

## Kontext a cíl

Chat je veřejný (`PUBLIC_CHAT=true`) a `POST /api/chat` může volat kdokoli — i curlem, mimo prohlížeč. Jediná dnešní obrana je in-memory rate limit, který podle vlastního komentáře v [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) ř. 1–4 počítá **per instance** a studený start ho nuluje. Na Vercelu tedy skutečný strop není: požadavky rozprostřené mezi instance se nesečtou.

Cena jedné zprávy je ~$0,035 (`claude-sonnet-4-6`, $3/$15 za MTok; ~8 500 vstupních tokenů kvůli 5 chunkům v kontextu a 3 667 znakům systémového promptu, ~600 výstupních). Při povolených 20 zprávách za minutu z jedné IP to je ~$42/h — a per-instance limit ani tohle nedrží. Chybí denní i měsíční strop a jakákoli kontrola, odkud požadavek přišel.

Cílem je, aby veřejné demo nešlo použít jako cizí účet za tokeny: strop, který platí napříč instancemi, tvrdá denní hranice útraty a odmítnutí požadavků mimo vlastní web.

## Výchozí stav (zjištěno průzkumem kódu)

| Oblast | Skutečnost |
|---|---|
| Rate limit | [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) — sliding window v `Map` v paměti procesu. Komentář sám přiznává: „per-instance … zmírnění zneužití, ne absolutní ochrana" |
| Limity rout | `chat` 20/min, `feedback` 10/min, `leads` 5/min; login 5/15 min per IP i per e-mail + globální strop 300 selhání |
| Strop útraty | **Neexistuje** — žádný denní ani měsíční limit, žádná evidence spotřebovaných tokenů |
| Spotřeba tokenů | `onFinish({ usage })` v [`src/app/api/chat/route.ts`](../../src/app/api/chat/route.ts) ř. ~297 ji zná, ale zapisuje ji jen do span atributů pro Langfuse. Nikde se nekumuluje |
| Kontrola originu | **Žádná.** [`src/proxy.ts`](../../src/proxy.ts) řeší jen session; `/api/chat` nemá CORS ani `Origin` check |
| Vstupní limity | 4 000 znaků na zprávu, 50 zpráv v požadavku, historie ořezaná na 8, `maxOutputTokens: 1500` |
| Identita volajícího | `sessionUser` se v chatu **už počítá** ([`chat/route.ts`](../../src/app/api/chat/route.ts) ř. 149) kvůli štítkům dokumentů — rozlišení anonym/přihlášený je zdarma |
| Prompt caching | Nepoužívá se. Kontext je slepený do `system` (ř. 265), takže se prefix mění s každým dotazem |

## Odsouhlasená rozhodnutí

1. **Úložiště počítadel: Supabase / Postgres.** Žádný nový zpracovatel osobních údajů, takže tabulka zpracovatelů na `/privacy` se nemění. IP se ukládá jen jako HMAC otisk.
2. **Při dosažení stropu:** anonymní tazatel dostane vysvětlující hlášku, **přihlášený uživatel se ptá dál** — útok nesmí vyřadit vlastní dema a testy.
3. **Origin:** projde jen požadavek s hlavičkou `Origin` ze seznamu; **chybějící hlavička = 403**.

## Předpoklady nasazení

- **`CRON_SECRET` musí být nastavený ve Vercel Project env.** Etapa A spoléhá na denní cron `/api/cron/retention` pro úklid `rate_limit_hits`, jenže routa bez secretu vrací 503 ([`cron/retention/route.ts`](../../src/app/api/cron/retention/route.ts) ř. 25–33) — a na demo instanci secret zatím nastavený není (retence je vědomě nezapnutá, viz `docs/gdpr.md`). Bez něj by tabulka rostla řádkem na IP a minutu bez konce. Nastavit **před** nasazením etapy A a ověřit `curl -H "Authorization: Bearer …" /api/cron/retention` → 200.
- **Migrace jdou po etapách:** `021` pro etapu A, `022` pro etapu B. Plán říká, že B je blokující a A ne, takže se mohou nasazovat odděleně — jedna společná migrace by je svázala.
- **Eval runner a `verify-rate-limit.mjs` se musí upravit ve stejném commitu jako etapy B a C** (viz B.3.5 a C.4) — jinak po nasazení přestanou fungovat.

---

## Etapa A — sdílený rate limit

### A.1 Migrace `021` — tabulka a RPC

```sql
create table rate_limit_hits (
  bucket       text        not null,   -- 'chat' | 'feedback' | 'leads' | 'login-ip' | 'login-user'
  key_hash     text        not null,   -- HMAC otisk IP nebo e-mailu, NIKDY holá hodnota
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (bucket, key_hash, window_start)
);
```

- [ ] **A.1.1** Tabulka + RLS zapnutá bez policy pro anon (vzor [`019_gdpr_retention.sql`](../../supabase/migrations/019_gdpr_retention.sql)).
- [ ] **A.1.2** RPC `rate_limit_hit(p_bucket, p_key_hash, p_window_seconds, p_limit) returns boolean` — jediný `insert … on conflict do update set count = count + 1 returning count`, takže inkrement i vyhodnocení jsou atomické bez zámku v aplikaci. `window_start` se dopočítá zaokrouhlením epochy dolů na násobek okna.
- [ ] **A.1.3** Pro login navíc `rate_limit_check(p_bucket, p_key_hash, p_window_seconds, p_limit) returns boolean` (jen čte, neinkrementuje) a `rate_limit_clear(p_bucket, p_key_hash)` (smaže řádky klíče v aktuálním okně). Důvod viz A.3.2 — login počítá selhání, ne pokusy.

> **Pevné okno, ne klouzavé** — vědomý ústupek: na přelomu oken projde až dvojnásobek limitu. Klouzavé okno by znamenalo držet pole časových značek na řádek; pevné okno je jeden řádek a jeden příkaz. Pro ochranu před náklady to stačí a pro login je to o řád lepší než dnešek (žádný sdílený limit).

### A.2 Nový modul `src/lib/rate-limit-shared.ts`

- [ ] **A.2.1** `allowShared(bucket, key, { limit, windowMs }): Promise<boolean>` — otiskne klíč HMAC-SHA256 a zavolá RPC.
- [ ] **A.2.2** Otisk **přesně podle vzoru `hashContact()`** v [`src/lib/privacy/contact.ts`](../../src/lib/privacy/contact.ts) ř. 85–95: klíč `PRIVACY_HASH_SECRET`, fallback `SESSION_SECRET`. Důvod je tam popsaný a platí i tady — holý SHA-256 nad prostorem IPv4 je slovníkově prolomitelný, takže by otisk byl pořád osobním údajem.
- [ ] **A.2.3** Při chybě **fail-open** — obalit celé volání včetně otisku, ne jen RPC: `hashContact` při chybějícím klíči **vyhazuje** ([`contact.ts`](../../src/lib/privacy/contact.ts) ř. 87–91), a i když `SESSION_SECRET` je povinný, limiter nesmí být místo, kde by se to projevilo jako 500. Chat bez Supabase stejně neodpoví (`retrieve` i `getSettings` na ní stojí), takže z limiteru nemá být zesilovač výpadku.
- [ ] **A.2.4** Pro login vedle `allowShared` i `checkShared` / `recordFailureShared` / `clearShared` nad RPC z A.1.3.

### A.3 Dvouvrstvý limit v routách

Stávající `createRateLimiter` **zůstává** jako rychlá lokální předfiltrace bez roundtripu; `allowShared` se volá až za ní jako autoritativní vrstva. Zjevná záplava z jedné instance se tak zastaví bez dotazu do DB, rozprostřený provoz zachytí sdílené počítadlo.

- [ ] **A.3.1** `POST /api/chat` (20/min), `POST /api/feedback` (10/min), `POST /api/leads` (5/min) — limity beze změny.
- [ ] **A.3.2** `POST /api/auth/login` — per-IP i per-e-mail 5/15 min. Bezpečnostně nejdůležitější: právě tam per-instance počítání znamená, že útočník dostane násobek pokusů.

  > **Login má jinou sémantiku než ostatní routy a musí ji zachovat.** Dnešní kód počítá **jen selhání** a úspěšné přihlášení počítadlo maže ([`login/route.ts`](../../src/app/api/auth/login/route.ts) ř. 12–16 výslovně varuje před sjednocením s `createRateLimiter`). Kdyby se použila jediná RPC `rate_limit_hit` (inkrement při každém volání), počítaly by se **pokusy**: šesté úspěšné přihlášení za 15 minut by účet zamklo a přihlášení po čtyřech překlepech by ho neodemklo. Proto tři operace: `checkShared` na začátku (jen čte), `recordFailureShared` ve `fail()`, `clearShared` po úspěchu — přesně tam, kde dnes stojí `isRateLimited`, `recordFailure` a `failedAttempts.delete`.
  >
  > **Globální strop 300 selhání / 15 min zůstává per instance.** Je to pojistka poslední instance proti spoofingu IP mimo důvěryhodnou platformu; na Vercelu je IP důvěryhodná a hlavní obranou je per-e-mail limit, který se sdíleným stane. Sdílet i globální strop by znamenalo jeden horký řádek pro celou aplikaci — za tu cenu to nestojí.

### A.4 Úklid starých řádků

- [ ] **A.4.1** Doplnit do **existujícího** retenčního runneru [`src/lib/privacy/retention.ts`](../../src/lib/privacy/retention.ts), který už běží denním cronem `/api/cron/retention` — mazat `rate_limit_hits` s `window_start` starším než den. Nový cron ani nová routa nevzniká.
- [ ] **A.4.2** Úklid musí stát **před** early returnem `if (!settings.retentionEnabled)` (ř. 40–50) — jinak bod níže neplatí. Neauditovat do `privacy_actions` (nejde o osobní údaje, audit by jen šuměl).
- [ ] **A.4.3** Rozšířit `RetentionResult` (ř. 12–20) o `rateLimitRowsDeleted` a přizpůsobit výpis v [`admin/privacy/client.tsx`](../../src/app/admin/(authenticated)/privacy/client.tsx) — ten výsledek runneru zobrazuje a bez úpravy by nové pole tiše ignoroval.

> Řádky nejsou osobní údaj v běžném smyslu (jen otisky), takže úklid **nepodléhá** přepínači `retention_enabled` — ten řídí mazání poptávek a hodnocení a jeho vypnutí nesmí nechat technickou tabulku růst donekonečna. Předpoklad: cron skutečně běží, tedy `CRON_SECRET` je nastavený (viz Předpoklady nasazení).

---

## Etapa B — denní strop útraty

### B.1 Migrace `022` — účetní kniha a parametry

```sql
create table llm_usage_daily (
  day           date   not null,
  route         text   not null,   -- 'chat' | 'lead-summary'
  model         text   not null,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  requests      int    not null default 0,
  primary key (day, route, model)
);
```

- [ ] **B.1.1** Tabulka + RLS + RPC `record_llm_usage(p_route, p_model, p_input, p_output)` (upsert s inkrementem).
- [ ] **B.1.2** `app_settings` += `spend_limit_enabled boolean default true`, `daily_spend_limit_usd numeric(10,2) default 5.00`, `price_input_per_mtok numeric(10,4) default 3.0000`, `price_output_per_mtok numeric(10,4) default 15.0000`.

- [ ] **B.1.3** Nové sloupce zavést do [`settings-meta.ts`](../../src/lib/settings-meta.ts) jako samostatnou skupinu `SPEND_*` s vlastním typem `SpendValues` a přidat je do `Omit` v `RagSettingsValues` (ř. 406) — jinak `parseSettingsInput` typově nepůjde a `POST /api/settings` by je začal vyžadovat. Doplnit i `SettingsValues`, `SettingsRow`, `SELECT_COLUMNS` a `fromRow` v [`settings.ts`](../../src/lib/settings.ts). To je to konkrétní místo, kde „oddělení drží typy".

> Ceny jsou parametr, ne konstanta v kódu: ceník se mění a `CHAT_MODEL` jde přepnout env proměnnou, takže natvrdo zapsaná cena by tiše lhala. Platí pro **chatový model**; řádky `lead-summary` (Mistral) se do knihy zapisují kvůli přehledu, ale do stropu se nepočítají — strop hlídá to, kde jsou peníze.

### B.2 Zápis spotřeby

- [ ] **B.2.1** V `onFinish({ usage })` v [`chat/route.ts`](../../src/app/api/chat/route.ts) doplnit vedle span atributů přímý `await` RPC `record_llm_usage`, **fail-open** (try/catch + `console.error`) — Supabase je zdroj pravdy pro účet, ne pro odpověď uživateli. Bez `after()`: `onFinish` je už async místo uvnitř životnosti requestu (ukončuje se tam span), další vrstva nepřímosti by nic nepřinesla.
- [ ] **B.2.2** Totéž u shrnutí v [`api/leads/route.ts`](../../src/app/api/leads/route.ts).

### B.3 Brána v chatu

- [ ] **B.3.1** Nový `src/lib/spend-guard.ts` — `isBudgetExhausted(settings)`: sečte dnešní `chat` řádky, vynásobí cenami, porovná s limitem. Výsledek se **memoizuje v procesu na 30 s**, aby nepřibyl roundtrip ke každé zprávě; cenou je přestřelení o zhruba půlminutu provozu, což je u coarse pojistky přijatelné.
- [ ] **B.3.2** Brána za `getSettings()` a `getSessionUser()` (ř. 143–149 — `sessionUser` už je k dispozici) a před `retrieve()`:

```
settings.spendLimitEnabled && sessionUser === null && (await isBudgetExhausted(settings))
  → hláška místo odpovědi
```

- [ ] **B.3.3** Odpověď kopíruje tvar **fallbackové větve** (ř. 246–254) — všechny čtyři hlavičky: `200`, `text/plain`, prázdná `X-Sources`, `X-Trace-Id`, `X-Lead-Capture` — widget i fullscreen ji vykreslí jako běžnou zprávu místo rozbitého fetche. Navíc hlavička `X-Budget-Exhausted: 1`, aby stav šel poznat strojově. Text hlášky jako konstanta `BUDGET_EXHAUSTED_MESSAGE` vedle `FALLBACK_MESSAGE` v `prompts.ts`.
- [ ] **B.3.4** Klient ([`use-kecalo-chat.ts`](../../src/lib/use-kecalo-chat.ts)) při `X-Budget-Exhausted: 1` označí zprávu příznakem a `MessageBubble` u ní **nevykreslí palce**. Jinak by palec dolů otevřel kartu kontaktu a zapsal řádek do `feedback` k hlášce, která s kvalitou odpovědi nesouvisí. Fallback dnes palce má — tam to smysl dává (hodnotí se rozhodnutí neodpovědět), u stropu ne.
- [ ] **B.3.5** **Eval runner musí být ze stropu vyjmutý.** [`scripts/langfuse-eval.mjs`](../../scripts/langfuse-eval.mjs) volá `/api/chat` anonymně (ř. 151–159); jeden běh `npm run eval` přes 7 datasetů se k výchozím $5 blíží, a po vyčerpání by každá další otázka dostala hlášku o stropu se **statusem 200** — runner by ji vzal jako odpověď a LLM-judge oskóroval jako špatnou, bez jediného varování. Runner už umí login kvůli `/api/settings` (`fetchTargetSettings`, ř. 199–229): přesunout získání cookie před smyčku a posílat ji i v `callChat` → přihlášený volající strop obchází (rozhodnutí 2). Když creds chybí, runner **skončí s chybou**, ne tichým během — a `callChat` navíc kontroluje `X-Budget-Exhausted` a při `1` běh přeruší.

> Vědomý ústupek: `200` u degradovaného stavu je diskutabilní. `503` by ale v obou klientech spadlo do chybové větve a návštěvník by viděl „něco se pokazilo" místo vysvětlení. Hlavička zachovává poctivost pro monitoring — a právě proto ji eval runner musí číst.

### B.4 Admin — nová stránka `/admin/usage`

- [ ] **B.4.1** „Provoz a náklady": dnešní a 30denní spotřeba (tokeny, odhad ceny, počet dotazů), stav stropu a editace parametrů.
- [ ] **B.4.2** Zapisuje **vlastní routa `POST /api/usage/settings`** (`requireAppRole("admin")`), ne `/api/settings`.

> Důvod je stejný jako u retence ([`src/lib/settings.ts`](../../src/lib/settings.ts) ř. 92–99): tlačítko „Obnovit výchozí" na stránce RAG parametrů posílá celou sadu polí, takže kdyby tam strop byl, jedno kliknutí by zvedlo nebo vyplo limit útraty. Oddělení drží typy v `settings-meta.ts`, ne domluva.

- [ ] **B.4.3** Položka v [`AdminSidebar.tsx`](../../src/components/AdminSidebar.tsx) pro roli `admin`.

---

## Etapa C — allowlist originů

Kontrola patří do [`src/proxy.ts`](../../src/proxy.ts) — běží v edge runtimu před kódem routy, takže odmítnutý požadavek nestojí ani DB dotaz. Týká se **`POST`** na `/api/chat`, `/api/feedback` a `/api/leads` (všechny tři už v matcheru jsou).

- [ ] **C.1** `ALLOWED_ORIGINS` — čárkou oddělený seznam. Proxy čte přímo `process.env` (nesmí importovat `lib/config`, viz komentář ř. 51–52).
- [ ] **C.2** **Proměnná nenastavená = povolen jen vlastní origin** požadavku, odvozený z `request.nextUrl.origin`. Dnešní nasazení tedy nepotřebuje nic nastavovat a chová se bezpečně; seznam se doplní, až widget poběží na cizím webu.
  > Na Vercelu za proxy je nutné **ověřit**, že `nextUrl` nese veřejný host (`x-forwarded-host`), ne interní — jinak by se vlastní origin nikdy neshodoval a chat by dostával 403 hned po nasazení. Patří do bodu 6 ověření; při nesouladu se origin skládá z `x-forwarded-proto` + `x-forwarded-host`.
- [ ] **C.3** Chybějící `Origin` → `403`.
- [ ] **C.4** Doplnit hlavičku `Origin` do **obou** Node skriptů, které veřejné routy volají: [`scripts/verify-rate-limit.mjs`](../../scripts/verify-rate-limit.mjs) a [`scripts/langfuse-eval.mjs`](../../scripts/langfuse-eval.mjs) (`callChat`) — jinak začnou dostávat 403; u eval runneru by to navíc vypadalo jako 100% selhání bota. Hodnota = `KECALO_BASE_URL` / `--base`.

> Poctivě: `Origin` je mimo prohlížeč triviálně padělatelný. Tohle zastaví vložení widgetu na cizí web a příležitostné zneužití, ne odhodlaného útočníka — skutečný strop dělají etapy A a B. Až přijde embed, tentýž seznam poslouží jako CORS allowlist.

---

## Dokumentace

- [ ] `CLAUDE.md` — nové tabulky v datovém modelu, `/admin/usage` a `POST /api/usage/settings` v seznamu rout, `ALLOWED_ORIGINS` v tabulce env, nové moduly ve stromu, sekce o dvouvrstvém rate limitu.
- [ ] [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — brána nákladů v popisu dotazovací pipeline; v „Známých omezeních" přepsat bod o in-memory limitech (přestane platit v původním znění).
- [ ] `README.md` — tentýž bod ve „Známých omezeních".
- [ ] `.env.example` — `ALLOWED_ORIGINS`.
- [ ] [`docs/gdpr.md`](../gdpr.md), kap. 1 „Mapa osobních údajů" — nový řádek `rate_limit_hits`: HMAC otisk IP (pseudonymizovaný údaj), titul oprávněný zájem (ochrana služby), uchování do 24 h (cron), mimo dosah výmazu na žádost (otisk nejde na kontakt zpětně navázat). Tabulka zpracovatelů se **nemění** (Supabase už tam je), ale mapa údajů řádek dostat musí — jinak by příručka tvrdila, že o návštěvnících nic neukládáme. `llm_usage_daily` osobní údaje nenese, do mapy nepatří.
- [ ] `scripts/langfuse-eval.mjs` — hlavička souboru (řádky s použitím) doplnit, že `ADMIN_USERNAME`/`ADMIN_PASSWORD` jsou od etapy B **povinné**, ne jen pro metadata.

## Ověření

1. `npm run lint`, `npm run build`, `supabase db push` (migrace `021`, u etapy B `022`).
2. **Sdílený limit:** `node scripts/verify-rate-limit.mjs` (po doplnění `Origin`) musí vrátit 429. Pak dotaz do `rate_limit_hits` — počet v řádku musí odpovídat odeslané dávce. To je podstatnější než samotné 429: dokazuje, že se počítá centrálně, ne per instance.
3. **Přežití studeného startu:** vyčerpat limit, počkat na uspání instance (nebo nasadit redeploy) a poslat další požadavek — musí přijít 429, ne čistý štít. Tohle dnešní implementace neumí a je to jádro etapy A.
4. **Login (A.3.2):** (a) 5× špatné heslo na jeden e-mail z různých IP → šestý pokus 429 — sdílený per-e-mail limit; (b) 4× špatné heslo, pak správné → 200 a **hned další** špatné heslo nesmí být 429 (úspěch počítadlo vymazal); (c) 6× správné heslo za sebou → všech šest 200 (počítají se selhání, ne pokusy). Bod (c) je ten, který by jednoduchá RPC `rate_limit_hit` neprošla.
5. **Strop útraty:** v `/admin/usage` nastavit limit na `0.01`, položit anonymní dotaz → hláška + hlavička `X-Budget-Exhausted: 1` a **bez palců** pod zprávou; tentýž dotaz s admin session → normální odpověď. Zkontrolovat, že `llm_usage_daily` po každém dotazu narostl.
6. **Eval runner při stropu:** s limitem `0.01` spustit `node scripts/langfuse-eval.mjs --limit=3 --dry` — musí projít (přihlášený), ne vrátit hlášku o stropu jako odpověď. Bez `ADMIN_USERNAME`/`ADMIN_PASSWORD` musí skončit chybou hned na začátku.
7. **Memoizace:** dvě zprávy hned po sobě po překročení stropu nesmí vyvolat dva dotazy do DB (ověřit v logu dev serveru).
8. **Origin:** `curl` bez hlavičky → 403; s `Origin: https://cizi-web.cz` → 403; s `Origin: http://localhost:3000` → 200; chat v prohlížeči funguje beze změny. **Na Vercelu navíc:** s `ALLOWED_ORIGINS` nenastavenou musí chat z prohlížeče na produkční i preview URL fungovat — ověřuje, že `nextUrl.origin` nese veřejný host (C.2). Tohle udělat na preview deploy **před** merge do main.
9. **Úklid:** ručně vložit řádek `rate_limit_hits` s `window_start` starým dva dny, spustit `POST /api/privacy/retention` a ověřit, že zmizel — **i při `retention_enabled = false`** — a že `/admin/privacy` počet smazaných řádků vypsal. Pak totéž přes `GET /api/cron/retention` s Bearer secretem (potvrzuje, že `CRON_SECRET` je nasazený).
10. Regresní průchod chatu v prohlížeči: stream, zdroje, karta poptávky, hodnocení; a plný `npm run eval` bez `--dry` s výsledky srovnatelnými s posledním experimentem.

## Co plán vědomě neřeší

- **Klouzavé okno** — pevné okno pustí na přelomu až 2× limit (viz A.1).
- **Náklady na embeddingy** — strop počítá jen tokeny chatového modelu; Voyage embedding dotazu (~$0,00002) je o tři řády levnější a fallbacková větev (0 chunků) LLM nevolá vůbec. Kdyby se někdy měřilo i to, jde o další `route` v téže knize.
- **Sdílený globální strop selhání loginu** — zůstává per instance (viz A.3.2).
- **Padělání `Origin`** mimo prohlížeč (viz etapa C).
- **Upozornění na dosažení stropu** — stav je vidět jen v `/admin/usage`, žádný e-mail ani webhook. Doplnitelné později přes existující cron.
- **Měsíční strop a per-session limit** — denní hranice je první a nejúčinnější; další hladiny by se stavěly nad toutéž knihou `llm_usage_daily`.
- **WAF / bot detection na úrovni Vercelu** — mimo kód aplikace.
- **Prompt caching** (~1 400 tokenů systémového promptu na každý dotaz) — reálná úspora, ale je to jiná změna: vyžaduje přesunout kontext ze `system` do `messages` ([`chat/route.ts`](../../src/app/api/chat/route.ts) ř. 265), což se dotýká RAG chování, a patří do vlastního plánu.
