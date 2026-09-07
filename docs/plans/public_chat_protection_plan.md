# Plán: Ochrana veřejného chatu — sdílený rate limit, denní strop útraty, allowlist originů

**Stav:** **návrh — neimplementováno.** Mimo číslované fáze. Vznikl z otázek k nasazení widgetu na veřejný web (embed skript, vlastní znalostní báze, náklady a limity); tenhle plán řeší **jen třetí okruh — náklady a zneužití**.

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

> **Pevné okno, ne klouzavé** — vědomý ústupek: na přelomu oken projde až dvojnásobek limitu. Klouzavé okno by znamenalo držet pole časových značek na řádek; pevné okno je jeden řádek a jeden příkaz. Pro ochranu před náklady to stačí a pro login je to o řád lepší než dnešek (žádný sdílený limit).

### A.2 Nový modul `src/lib/rate-limit-shared.ts`

- [ ] **A.2.1** `allowShared(bucket, key, { limit, windowMs }): Promise<boolean>` — otiskne klíč HMAC-SHA256 a zavolá RPC.
- [ ] **A.2.2** Otisk **přesně podle vzoru `hashContact()`** v [`src/lib/privacy/contact.ts`](../../src/lib/privacy/contact.ts) ř. 85–95: klíč `PRIVACY_HASH_SECRET`, fallback `SESSION_SECRET`. Důvod je tam popsaný a platí i tady — holý SHA-256 nad prostorem IPv4 je slovníkově prolomitelný, takže by otisk byl pořád osobním údajem.
- [ ] **A.2.3** Při chybě DB **fail-open**. Chat bez Supabase stejně neodpoví (`retrieve` i `getSettings` na ní stojí), takže z limiteru nemá být zesilovač výpadku.

### A.3 Dvouvrstvý limit v routách

Stávající `createRateLimiter` **zůstává** jako rychlá lokální předfiltrace bez roundtripu; `allowShared` se volá až za ní jako autoritativní vrstva. Zjevná záplava z jedné instance se tak zastaví bez dotazu do DB, rozprostřený provoz zachytí sdílené počítadlo.

- [ ] **A.3.1** `POST /api/chat` (20/min), `POST /api/feedback` (10/min), `POST /api/leads` (5/min) — limity beze změny.
- [ ] **A.3.2** `POST /api/auth/login` — per-IP i per-e-mail 5/15 min. Bezpečnostně nejdůležitější: právě tam per-instance počítání znamená, že útočník dostane násobek pokusů.

### A.4 Úklid starých řádků

- [ ] **A.4.1** Doplnit do **existujícího** retenčního runneru [`src/lib/privacy/retention.ts`](../../src/lib/privacy/retention.ts), který už běží denním cronem `/api/cron/retention` — mazat `rate_limit_hits` s `window_start` starším než den. Nový cron ani nová routa nevzniká.

> Řádky nejsou osobní údaj v běžném smyslu (jen otisky), takže úklid **nepodléhá** přepínači `retention_enabled` — ten řídí mazání poptávek a hodnocení a jeho vypnutí nesmí nechat technickou tabulku růst donekonečna.

---

## Etapa B — denní strop útraty

### B.1 Migrace `021` — účetní kniha a parametry

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

> Ceny jsou parametr, ne konstanta v kódu: ceník se mění a `CHAT_MODEL` jde přepnout env proměnnou, takže natvrdo zapsaná cena by tiše lhala. Platí pro **chatový model**; řádky `lead-summary` (Mistral) se do knihy zapisují kvůli přehledu, ale do stropu se nepočítají — strop hlídá to, kde jsou peníze.

### B.2 Zápis spotřeby

- [ ] **B.2.1** V `onFinish({ usage })` v [`chat/route.ts`](../../src/app/api/chat/route.ts) doplnit vedle span atributů volání `record_llm_usage` v `after()`, **fail-open** — Supabase je zdroj pravdy pro účet, ne pro odpověď uživateli.
- [ ] **B.2.2** Totéž u shrnutí v [`api/leads/route.ts`](../../src/app/api/leads/route.ts).

### B.3 Brána v chatu

- [ ] **B.3.1** Nový `src/lib/spend-guard.ts` — `isBudgetExhausted(settings)`: sečte dnešní `chat` řádky, vynásobí cenami, porovná s limitem. Výsledek se **memoizuje v procesu na 30 s**, aby nepřibyl roundtrip ke každé zprávě; cenou je přestřelení o zhruba půlminutu provozu, což je u coarse pojistky přijatelné.
- [ ] **B.3.2** Brána za `getSettings()` a `getSessionUser()` (ř. 143–149 — `sessionUser` už je k dispozici) a před `retrieve()`:

```
settings.spendLimitEnabled && sessionUser === null && (await isBudgetExhausted(settings))
  → hláška místo odpovědi
```

- [ ] **B.3.3** Odpověď kopíruje tvar **fallbackové větve** (ř. 246–254): `200`, `text/plain`, prázdná `X-Sources`, `X-Trace-Id` — widget i fullscreen ji vykreslí jako běžnou zprávu místo rozbitého fetche. Navíc hlavička `X-Budget-Exhausted: 1`, aby stav šel poznat strojově.

> Vědomý ústupek: `200` u degradovaného stavu je diskutabilní. `503` by ale v obou klientech spadlo do chybové větve a návštěvník by viděl „něco se pokazilo" místo vysvětlení. Hlavička zachovává poctivost pro monitoring.

### B.4 Admin — nová stránka `/admin/usage`

- [ ] **B.4.1** „Provoz a náklady": dnešní a 30denní spotřeba (tokeny, odhad ceny, počet dotazů), stav stropu a editace parametrů.
- [ ] **B.4.2** Zapisuje **vlastní routa `POST /api/usage/settings`** (`requireAppRole("admin")`), ne `/api/settings`.

> Důvod je stejný jako u retence ([`src/lib/settings.ts`](../../src/lib/settings.ts) ř. 92–99): tlačítko „Obnovit výchozí" na stránce RAG parametrů posílá celou sadu polí, takže kdyby tam strop byl, jedno kliknutí by zvedlo nebo vyplo limit útraty. Oddělení drží typy v `settings-meta.ts`, ne domluva.

- [ ] **B.4.3** Položka v [`AdminSidebar.tsx`](../../src/components/AdminSidebar.tsx) pro roli `admin`.

---

## Etapa C — allowlist originů

Kontrola patří do [`src/proxy.ts`](../../src/proxy.ts) — běží v edge runtimu před kódem routy, takže odmítnutý požadavek nestojí ani DB dotaz. Týká se **`POST`** na `/api/chat`, `/api/feedback` a `/api/leads` (všechny tři už v matcheru jsou).

- [ ] **C.1** `ALLOWED_ORIGINS` — čárkou oddělený seznam. Proxy čte přímo `process.env` (nesmí importovat `lib/config`, viz komentář ř. 51–52).
- [ ] **C.2** **Proměnná nenastavená = povolen jen vlastní origin** požadavku. Dnešní nasazení tedy nepotřebuje nic nastavovat a chová se bezpečně; seznam se doplní, až widget poběží na cizím webu.
- [ ] **C.3** Chybějící `Origin` → `403`.
- [ ] **C.4** Doplnit hlavičku `Origin` do [`scripts/verify-rate-limit.mjs`](../../scripts/verify-rate-limit.mjs) — jinak začne dostávat 403 a přestane ověřovat, co má.

> Poctivě: `Origin` je mimo prohlížeč triviálně padělatelný. Tohle zastaví vložení widgetu na cizí web a příležitostné zneužití, ne odhodlaného útočníka — skutečný strop dělají etapy A a B. Až přijde embed, tentýž seznam poslouží jako CORS allowlist.

---

## Dokumentace

- [ ] `CLAUDE.md` — nové tabulky v datovém modelu, `/admin/usage` a `POST /api/usage/settings` v seznamu rout, `ALLOWED_ORIGINS` v tabulce env, nové moduly ve stromu, sekce o dvouvrstvém rate limitu.
- [ ] [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — brána nákladů v popisu dotazovací pipeline; v „Známých omezeních" přepsat bod o in-memory limitech (přestane platit v původním znění).
- [ ] `README.md` — tentýž bod ve „Známých omezeních".
- [ ] `.env.example` — `ALLOWED_ORIGINS`.

## Ověření

1. `npm run lint`, `npm run build`, `supabase db push` (migrace `021`).
2. **Sdílený limit:** `node scripts/verify-rate-limit.mjs` (po doplnění `Origin`) musí vrátit 429. Pak dotaz do `rate_limit_hits` — počet v řádku musí odpovídat odeslané dávce. To je podstatnější než samotné 429: dokazuje, že se počítá centrálně, ne per instance.
3. **Přežití studeného startu:** vyčerpat limit, počkat na uspání instance (nebo nasadit redeploy) a poslat další požadavek — musí přijít 429, ne čistý štít. Tohle dnešní implementace neumí a je to jádro etapy A.
4. **Strop útraty:** v `/admin/usage` nastavit limit na `0.01`, položit anonymní dotaz → hláška + hlavička `X-Budget-Exhausted: 1`; tentýž dotaz s admin session → normální odpověď. Zkontrolovat, že `llm_usage_daily` po každém dotazu narostl.
5. **Memoizace:** dvě zprávy hned po sobě po překročení stropu nesmí vyvolat dva dotazy do DB (ověřit v logu dev serveru).
6. **Origin:** `curl` bez hlavičky → 403; s `Origin: https://cizi-web.cz` → 403; s `Origin: http://localhost:3000` → 200; chat v prohlížeči funguje beze změny.
7. **Úklid:** ručně vložit řádek `rate_limit_hits` s `window_start` starým dva dny, spustit `POST /api/privacy/retention` a ověřit, že zmizel — **i při `retention_enabled = false`**.
8. Regresní průchod chatu v prohlížeči: stream, zdroje, karta poptávky, hodnocení.

## Co plán vědomě neřeší

- **Klouzavé okno** — pevné okno pustí na přelomu až 2× limit (viz A.1).
- **Padělání `Origin`** mimo prohlížeč (viz etapa C).
- **Upozornění na dosažení stropu** — stav je vidět jen v `/admin/usage`, žádný e-mail ani webhook. Doplnitelné později přes existující cron.
- **Měsíční strop a per-session limit** — denní hranice je první a nejúčinnější; další hladiny by se stavěly nad toutéž knihou `llm_usage_daily`.
- **WAF / bot detection na úrovni Vercelu** — mimo kód aplikace.
- **Prompt caching** (~1 400 tokenů systémového promptu na každý dotaz) — reálná úspora, ale je to jiná změna: vyžaduje přesunout kontext ze `system` do `messages` ([`chat/route.ts`](../../src/app/api/chat/route.ts) ř. 265), což se dotýká RAG chování, a patří do vlastního plánu.
