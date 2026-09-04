# Plán: Příprava Kecala na GDPR

**Stav:** **hotovo** — etapy A–G dokončené a E2E ověřené (4. 9. 2026). Mimo číslované fáze; uzavírá položku „GDPR: retence konverzací, mazání dat" z produkčního dluhu ([`docs/IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md)) a navazuje na dluh evidovaný v [PRD kap. 15](../PRD_pojistovaci_RAG_chatbot.md) a [`LANGFUSE_PLAN.md`](LANGFUSE_PLAN.md).

## Kontext a cíl

Kecalo je v předprodukční fázi a už dnes sbírá osobní údaje reálných lidí: poptávky z chatu (jméno, e-mail, telefon, poznámka a LLM shrnutí konverzace), zpětnou vazbu včetně **doslovného textu dotazu** a účty zaměstnanců. Chybí přitom všechno, co k tomu GDPR vyžaduje: data se nikdy nemažou, neexistuje retenční lhůta ani způsob, jak vyhovět žádosti o výmaz nebo o přístup k údajům, a subjekt údajů nedostane žádnou informaci o zpracování — souhlas je jediná věta bez správce, účelu, doby uchování i seznamu zpracovatelů. Do toho jde obsah dotazů ven k dalšímu zpracovateli.

Cílem je uvést aplikaci do stavu, kdy zpracování osobních údajů odpovídá GDPR: omezené dobou uložení, s vymahatelnými právy subjektu, transparentně popsané a s minimalizovaným tokem obsahu k třetím stranám.

## Výchozí stav (zjištěno průzkumem kódu)

| Oblast | Skutečnost |
|---|---|
| `leads` | Jméno, e-mail, telefon, poznámka, `summary` (shrnutí konverzace od Mistralu), `session_id`, `consent`. **Mazání záměrně neexistuje** — [`src/app/api/leads/[id]/route.ts`](../../src/app/api/leads/[id]/route.ts) ř. 9, uzavření jen nastaví `closed` |
| `feedback` | Ukládá **doslovný text dotazu** do `query` (2000 zn.) — upsert v [`src/app/api/feedback/route.ts`](../../src/app/api/feedback/route.ts) ř. 43–52. Bez mazání. Dokumentace tvrdí opak (`IMPLEMENTATION_PLAN.md` ř. 365: „neukládáme obsah zpráv") |
| `users` | Jméno, příjmení, e-mail; účty se jen deaktivují, nemažou |
| Historie chatu | Jen v paměti klienta, na server ani do DB se neukládá. V `localStorage` je pouze `kecalo_session_id` — [`src/lib/use-kecalo-chat.ts`](../../src/lib/use-kecalo-chat.ts) ř. 54–62 |
| `session_id` | **Propojuje anonymní chat s identifikovanou poptávkou** (`leads.session_id`, `feedback.session_id`) a odchází i do Langfuse jako `langfuse.session.id` a v ID skóre `thumbs:<sessionId>:<idx>` |
| Telemetrie | Při `record_content` jde do Langfuse plný text dotazu, kontext dokumentů, odpověď a u poptávky **celý přepis konverzace** ([`src/app/api/leads/route.ts`](../../src/app/api/leads/route.ts) ř. 187–196). V produkci je zapnutý navzdory defaultu `false` |
| Zpracovatelé | Anthropic (dotaz + historie), Voyage (dotaz), Mistral (přepis konverzace), Supabase (perzistence), Langfuse (telemetrie), Vercel (hosting, IP v logu) |
| Transparence | Žádná stránka se zásadami, žádný odkaz, žádná identifikace správce. Souhlas = [`src/components/LeadForm.tsx`](../../src/components/LeadForm.tsx) ř. 184–186 |
| Retence / cron | Neexistuje. Repozitář nemá `vercel.json` ani úklidový skript |
| Logy | Žádný `console.*` neloguje obsah dotazu ani kontakt — v pořádku |

## Rozhodnutí (potvrzeno uživatelem, 3. 9. 2026)

- **Rozsah:** kód + texty v aplikaci. Právní přesnost textů dá zkontrolovat právník, plán dodává funkční draft.
- **`record_content`:** v produkci vypnout, zůstává jako nástroj pro dočasné ladění.
- **Retence:** automatický cron **i** ruční spuštění z administrace.
- **Výchozí lhůty:** poptávky 24 měsíců, zpětná vazba 6 měsíců (editovatelné za běhu).
- **Práva subjektu:** nástroj v administraci — vyhledání podle kontaktu, náhled, export JSON, trvalý výmaz. Identitu žadatele ověřuje obsluha, ne aplikace.
- **Provozní režim (veřejný vs. interní):** **žádný globální přepínač režimu.** Hranice „smí se ptát anonym" patří do env a proxy, ostatní chování zůstává nezávislými parametry a režim se jen odvozuje a zobrazuje — viz etapa G.

---

## Etapa A — datový základ a retenční parametry

**Migrace `019_gdpr_retention.sql`** (jediná cesta ke změně schématu, konvence projektu):

- `app_settings` += `retention_enabled boolean DEFAULT false`, `retention_leads_months int DEFAULT 24 CHECK (1..120)`, `retention_feedback_months int DEFAULT 6 CHECK (1..120)`.
  `retention_enabled` je záměrně **false**: nasazení migrace nesmí nic smazat dřív, než správce lhůty vědomě potvrdí.
- Nová tabulka `privacy_actions` — auditní stopa podle zásady odpovědnosti (čl. 5 odst. 2):
  `id uuid PK, kind text CHECK ('retention'|'erasure'), subject_hash text NULL, leads_deleted int, feedback_deleted int, performed_by uuid NULL FK→users, created_at timestamptz`.
  **Neobsahuje osobní údaje v čitelné podobě** — místo kontaktu jen otisk normalizovaného kontaktu. Otisk je **HMAC-SHA256 se serverovým tajemstvím** (nová env `PRIVACY_HASH_SECRET`, nebo odvození z `SESSION_SECRET`), ne prostý SHA-256: prostor telefonních čísel i běžných e-mailů je slovníkově prolomitelný, takže čistý hash by byl pořád pseudonymizovaný osobní údaj. Auditní účel („tento výmaz proběhl") plní keyed hash stejně. RLS zapnutá bez policy pro anon, jako všude jinde.

- [x] **A.1** Migrace `019_gdpr_retention.sql`, `supabase db push`.
- [x] **A.2** [`src/lib/settings-meta.ts`](../../src/lib/settings-meta.ts): skupiny `RETENTION_SLIDER_FIELDS` (dvě lhůty) a `RETENTION_TOGGLE_FIELDS` (`retentionEnabled`). Rozsahy CHECK v migraci odpovídají min/max zde (konvence projektu).
  **Odchylka od původního návrhu:** retenční pole se do `ALL_NUMERIC_FIELDS` / `ALL_TOGGLE_FIELDS` ZÁMĚRNĚ nezařadila. Ty množiny vymezují přesně to, co zapisuje `POST /api/settings`, takže „Obnovit výchozí" na `/admin/parameters` by retenci tiše vyplo kliknutím, které s ní zdánlivě nesouvisí. Oddělené množiny to vylučují konstrukcí, ne dohodou; typovou hranici drží generika `SettingField<K>` / `ToggleField<K>` nad klíči `RagNumericKey` vs. `RetentionNumericKey` — pole jedné skupiny nejde vložit do množiny druhé. Ukládání jde vlastní cestou `saveRetentionSettings()` + `POST /api/privacy/settings`; chybějící pole ve vstupu se berou z aktuálních hodnot, ne z továrních defaultů.
- [x] **A.3** [`src/lib/settings.ts`](../../src/lib/settings.ts): doplnit sloupce do `SELECT_COLUMNS`, `SettingsRow`, `fromRow`.

---

## Etapa B — retence: cron i ruční spuštění

**Nový soubor `src/lib/privacy/retention.ts`** — `runRetention({ performedBy })`. Jediná implementace, dvě vstupní branky:

- `leads`: smaže řádky, kde `updated_at < now() - retention_leads_months`. Záměrně `updated_at`, ne `created_at` — deduplikace při opakované poptávce řádek aktualizuje, takže lhůta běží od poslední interakce.
- `feedback`: smaže řádky, kde `created_at < now() - retention_feedback_months`.
- Když `retention_enabled = false`, funkce **nic nemaže** a vrátí `{ skipped: true }`.
- Každý běh zapíše řádek do `privacy_actions` (`kind='retention'`, počty).

- [x] **B.1** `src/lib/privacy/retention.ts` — `runRetention()` nad `getSettings()` a service-role klientem.
- [x] **B.2** `src/app/api/cron/retention/route.ts` (GET) — autorizace **výhradně** hlavičkou `Authorization: Bearer $CRON_SECRET`, porovnání `timingSafeEqual`; chybějící `CRON_SECRET` = 503, ne otevřená routa. Nová env proměnná `CRON_SECRET` do `.env.example`.
- [x] **B.3** `vercel.json` (nový soubor) — cron `0 3 * * *` na `/api/cron/retention`.
- [x] **B.4** `src/app/api/privacy/retention/route.ts` (POST) — ruční spuštění, `requireAppRole("admin")` z [`src/lib/require-role.ts`](../../src/lib/require-role.ts), `performed_by` = id přihlášeného.
- [x] **B.5** [`src/proxy.ts`](../../src/proxy.ts): přidat `/api/privacy/:path*` do matcheru. `/api/cron/*` do matcheru **nepatří** — cron nemá session cookie, chrání se vlastním secretem.

---

## Etapa C — práva subjektu údajů (nástroj v adminu)

Nová stránka **`/admin/privacy`** (položka „Soukromí" v [`AdminSidebar.tsx`](../../src/components/AdminSidebar.tsx), jen pro roli `admin`) se třemi bloky: retenční parametry, vyhledání subjektu, historie akcí z `privacy_actions`.

Vyhledání pracuje s kontaktem (e-mail nebo telefon) normalizovaným **stejnými funkcemi jako zápis poptávky** ([`src/app/api/leads/route.ts`](../../src/app/api/leads/route.ts) ř. 50–59 — vytáhnout je do `src/lib/privacy/contact.ts` a importovat na obou místech, ať se normalizace nerozejde). Postup: kontakt → poptávky → jejich `session_id` → navázané řádky `feedback`. `session_id` je jediný most mezi kontaktem a zpětnou vazbou; bez něj by výmaz nechal text dotazu v DB.

- [x] **C.1** `src/lib/privacy/contact.ts` — `normalizeEmail`/`normalizePhone` (přesunuty z leads route, ta je importuje), `normalizeContact()`, `hashContact()` (HMAC, viz etapa A).
  **Doplněno oproti návrhu:** `contactSearchValues()` — telefon se HLEDÁ i ve variantě s předvolbou a bez ní (`777123456` ↔ `+420777123456`). Zápis dál ukládá jedinou normalizovanou podobu, rozšíření je pouze pro čtení. Bez něj by ověřovací bod 7 neprošel a hlavně: subjekt, jehož číslo bylo uloženo v jiném tvaru, než v jakém o výmaz požádá, by v bázi zůstal.
- [x] **C.2** `src/lib/privacy/subject.ts` — `findSubjectData(contact)` → poptávky + navázaná zpětná vazba; `eraseSubject(contact, performedBy)` → smaže obojí v pořadí feedback → leads a zapíše `privacy_actions`.
- [x] **C.3** `src/app/api/privacy/subject/route.ts` — vyhledání i výmaz jako **`POST` s kontaktem v těle** (akce rozlišená polem `action: 'find' | 'erase'`, obojí admin). Záměrně ne `GET ?contact=`: e-mail/telefon v query stringu by skončil ve Vercel logách, které jsou mimo naši kontrolu (viz Rizika). Rate limit není potřeba — routa je za session.
- [x] **C.4** `/admin/privacy` (`page.tsx` server + `client.tsx`) — formulář kontaktu, tabulka nálezů, tlačítko **Stáhnout JSON** (export podle čl. 15/20 se skládá na klientu z odpovědi vyhledání, žádná další routa), tlačítko **Trvale smazat** s potvrzovacím dialogem, karty retenčních parametrů a tlačítko **Spustit úklid teď**. Historii akcí z `privacy_actions` načítá přímo server komponenta `page.tsx` (service-role klient) — žádná API routa pro ni nevzniká.
- [x] **C.5** Export a výmaz **nezahrnují `users`** — zaměstnanecké účty se řeší přes `/admin/users` a jejich mazání je jiný právní titul (plnění smlouvy, ne souhlas). Uvést to jako poznámku v UI, ať obsluha neplete agendy.
- [x] **C.6** *(splněno s F.1 — `docs/gdpr.md` kap. 5)* Zapsáno **známé omezení dohledatelnosti**: cesta kontakt → `leads.session_id` → `feedback` najde jen hlasy ze session, ve které subjekt zanechal kontakt. Hlasy z jiného prohlížeče/zařízení (jiné `session_id`) nebo od subjektu, který poptávku nikdy neposlal, dohledat nejdou — inherentní limit pseudonymního designu (bez účtů a serverové historie víc nejde). Obsluha to musí vědět při vyřizování žádosti podle čl. 15.

---

## Etapa D — transparence: zásady zpracování a souhlas

- [x] **D.1** `src/app/privacy/page.tsx` — veřejná statická stránka „Zásady zpracování osobních údajů", **mimo** proxy matcher. Obsah (draft k právní kontrole): správce a kontakt, účely a právní tituly (souhlas u poptávky, oprávněný zájem u zpětné vazby a provozní telemetrie), rozsah údajů, **doba uchování shodná s nastavenými lhůtami**, kategorie příjemců včetně jmenovitého seznamu zpracovatelů a informace o předání mimo EU (Anthropic, Voyage, Langfuse), práva subjektu a způsob jejich uplatnění, poučení o odvolatelnosti souhlasu, informace o `localStorage` (`kecalo_session_id`).
- [x] **D.2** [`src/components/LeadForm.tsx`](../../src/components/LeadForm.tsx) — souhlas nese účel, správce, odvolatelnost a odkaz na `/privacy` (`target="_blank"`).
  **Odchylka:** doba uchování v textu souhlasu ZÁMĚRNĚ není. Číslo se řídí `app_settings`, takže opsané do věty u formuláře by se po změně lhůty tiše rozešlo se skutečností — a nepravdivý souhlas je horší vada než jedno kliknutí navíc. Autoritativní údaj je na odkazovaných zásadách, které ho čtou z téhož zdroje.
- [x] **D.3** Odkaz na `/privacy` do patičky chatu (`src/app/page.tsx`, vedle [`DemoCredit`](../../src/components/DemoCredit.tsx)) a do patičky panelu widgetu ([`ChatWidget.tsx`](../../src/components/ChatWidget.tsx)) — subjekt musí být informován **před** předáním údajů, ne až u formuláře.
- [x] **D.5** *(nad rámec plánu)* Veřejné zásady vypisují lhůty z `app_settings`, takže při vypnutém úklidu slibují mazání, které se neděje. `/admin/privacy` proto při `retention_enabled = false` zobrazí varování, že zásady na `/privacy` uvádějí lhůty, které se nedodržují — vazba mezi slibem a mechanismem se hlídá v aplikaci, ne až při kontrole.
- [x] **D.4** Cookie banner se **nezavádí** a je to vědomé rozhodnutí: chat nepoužívá cookies ani analytiku, `kecalo_session_id` v `localStorage` je nezbytný pro funkci (deduplikace hlasů, návaznost poptávky) a spadá pod výjimku. Zapsat do `/privacy` i do dokumentace, aby to nevypadalo jako opomenutí.

---

## Etapa E — minimalizace toku dat ven

- [x] **E.1** `record_content` je v produkci **vypnutý** (`app_settings.record_content = false`). Ověřeno na reálných trace přes Langfuse API: `chat-pipeline` i generation span `chat-rag:ai.streamText.doStream` mají `input` i `output` `null`.
- [x] **E.2** Varování u přepínače `recordContent` v [`settings-meta.ts`](../../src/lib/settings-meta.ts) nově říká, že dotazy jsou osobní údaje, zapnutí je zpracování navíc a předání dalšímu zpracovateli — a že na obsah v Langfuse **nedosáhne výmaz na žádost** z `/admin/privacy`.
- [x] **E.3** *(rozhodnuto uživatelem 4. 9. 2026: ukládat jen u „down")* `feedback.query` se ukládá **jen při hodnocení „down"** (u palce nahoru nemá text dotazu analytickou hodnotu, kterou by nenesla dvojice `session_id`/`message_index`). Minimalizace údajů, čl. 5 odst. 1 písm. c. Implementováno podmínkou v upsertu ve `feedback/route.ts`; ověřeno reálným požadavkem (up → `NULL`, down → text uložen). Existující řádky se nečistí — doběhnou retenční lhůtou. V interním nasazení (etapa G) by to stejně přestalo být volitelné: za přihlášením je text dotazu jmenovitým záznamem o tom, na co se konkrétní zaměstnanec ptal.
- [x] **E.4** Provozní kroky jsou v `docs/gdpr.md` jako checklist před ostrým provozem (kap. 8) — vč. retence v Langfuse, zpracovatelských smluv a ověření regionu Supabase.

---

## Etapa F — dokumentace

- [x] **F.1** [`docs/gdpr.md`](../gdpr.md) — mapa osobních údajů, retenční úklid, postup pro žádost o přístup i o výmaz, známé omezení dohledatelnosti (C.6), zaměstnanecké účty (G.6.1), zpracovatelé a checklist před ostrým provozem.
- [x] **F.2** (provedeno při etapě A–C: položka dluhu zaškrtnuta, nepravdivá poznámka o neukládání obsahu opravena) — [`docs/IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md): zaškrtnout položku GDPR na ř. 931 a **opravit nepravdivou poznámku na ř. 365** („neukládáme obsah zpráv" — `feedback.query` ho ukládá).
- [x] **F.3** (provedeno při etapě A–D: sekce 6.1 „Osobní údaje a retence", 5.1 „Retenční cron", routy i `privacy_actions` v datovém modelu) — [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md): nová sekce „Osobní údaje a retence", doplnit nové routy a tabulku `privacy_actions` do datového modelu.
- [x] **F.4** (provedeno průběžně při etapách A–D) — [`CLAUDE.md`](../../CLAUDE.md): routy, migrace `019`, adresář `src/lib/privacy/`, stránky `/admin/privacy` a `/privacy`, nové parametry v `app_settings`, `CRON_SECRET` v tabulce env; upravit větu o chybějících GDPR procesech ve Stavu projektu.
- [x] **F.5** (provedeno při etapě B; `PRIVACY_HASH_SECRET` doplněn jako volitelný) — [`.env.example`](../../.env.example): `CRON_SECRET` (+ `PRIVACY_HASH_SECRET`, pokud se otisk kontaktu neodvodí ze `SESSION_SECRET` — viz etapa A); totéž do tabulky env v `CLAUDE.md` (F.4).

---

## Etapa G — provozní režim: hranice, parametry, odvozený stav

Kecalo může běžet jako veřejný chat pro klienty nebo jako interní nástroj za přihlášením. GDPR platí v obou případech, mění se jen tvar: interně odpadá sběr poptávek a souhlas jako právní titul (v zaměstnaneckém vztahu se pro nerovné postavení stran obecně nepovažuje za svobodný), ale text dotazu se stává jmenovitým záznamem a znalostní báze může obsahovat osobní údaje klientů.

**Klíčové rozhodnutí: režim se neukládá jako přepínač.** Jeden boolean v `app_settings` by se rozvětvil do desítek podmínek, zdvojnásobil matici testování a hlavně by měnil GDPR-relevantní chování jedním kliknutím v adminu. Právní titul se přitom váže k okamžiku sběru — po přepnutí by starým řádkům titul nezůstal doložitelný (čl. 5 odst. 2). Místo toho tři oddělené vrstvy:

### G.1 Tvrdá hranice na úrovni nasazení

Jestli smí do chatu anonym, je bezpečnostní rozhodnutí, ne preference — špatné přepnutí zpřístupní interní bázi internetu. Patří do env, ne do admin UI.

- [x] **G.1.1** Env `PUBLIC_CHAT` ([`.env.example`](../../.env.example) + [`src/lib/config.ts`](../../src/lib/config.ts)). Bez výslovného povolení se `/api/chat`, `/api/feedback` a `POST /api/leads` chovají jako admin routy.
- [x] **G.1.2** [`src/proxy.ts`](../../src/proxy.ts): `config.matcher` je v Next.js **build-time konstanta** — nejde podmínit env proměnnou. Cesty `/`, `/demo`, `/api/chat`, `/api/feedback` se do matcheru přidají **vždy** a o propuštění rozhodne runtime kód uvnitř `proxy()` podle `PUBLIC_CHAT` (při zapnutém veřejném chatu rovnou `NextResponse.next()`; proxy pak poběží na každém requestu chatu i ve veřejném režimu — neškodné, jen podpisová kontrola se přeskočí). Při vypnutém `PUBLIC_CHAT` navíc neplatí výjimka pro `POST /api/leads` (ř. 34–37). Vzor „chybějící konfigurace = zamítnout" už proxy používá u `SESSION_SECRET` (ř. 56–60) — držet se ho.
- [x] **G.1.3** Kořenová stránka `/` a `/demo` při vypnutém veřejném chatu vyžadují session (`/demo` je dnes veřejná mimo matcher).

### G.2 Nezávislé parametry místo režimu

Chování spolu koreluje, ale není to táž věc; splácnutí do jednoho přepínače by sebralo mezistavy.

| Chování | Stav |
|---|---|
| Výchozí viditelnost dokumentů | `default_document_visibility` — **existuje** (migrace 016) |
| Kdo vidí které chunky | štítky + `match_chunks` — **existuje** |
| Sběr poptávek | **nové:** přepínač `lead_capture_enabled` |
| Ukládání textu dotazu | E.3 |
| Retenční lhůty | etapa A |

- [x] **G.2.1** Migrace `020`: `app_settings` += `lead_capture_enabled boolean DEFAULT true`; pole do [`settings-meta.ts`](../../src/lib/settings-meta.ts) a [`settings.ts`](../../src/lib/settings.ts) stejným vzorem jako A.2/A.3.
- [x] **G.2.2** Gate na obou koncích: instrukci o tokenu `[[NABIDKA]]` nevkládat do efektivního systémového promptu ([`prompts.ts`](../../src/lib/rag/prompts.ts)) a `POST /api/leads` při vypnutém sběru vracet 403. Samotné vypuštění z promptu nestačí — routa je veřejná. **Řešeno připojenou direktivou, ne vystřižením:** prompt je editovatelný adminem, takže „tu větu o tokenu" nejde spolehlivě najít a odebrat — v override může znít jakkoli. Při vypnutém sběru se proto k promptu **připojí zákaz** („nikdy nepřidávej token [[NABIDKA]]"), což funguje pro výchozí i vlastní prompt. **Limit u prompt overridu (Fáze 17):** má-li admin v `app_settings.system_prompt` vlastní text, instrukce tokenu je uvnitř něj a kód ji odstranit neumí — pak se vědomě spoléhá na zbývající vrstvy (klient token stripuje, `LeadForm` se nevykreslí dle G.2.3, routa vrací 403). Zapsat do varování u karty promptu v `/admin/parameters/prompts`.
- [x] **G.2.3** *(příznak jde na klienta hlavičkou `X-Lead-Capture` z `/api/chat` — karta po palci dolů se řídí čistě klientem, token ji neovlivní)* `LeadForm` se nevykresluje ani po palci dolů ([`MessageBubble.tsx`](../../src/components/MessageBubble.tsx) ř. 64–115); hlas se ukládá dál.

### G.3 Právní titul u sběru

Řeší nedoložitelnost po změně konfigurace — proto se ukládá k řádku, ne do nastavení.

- [x] **G.3.1** Migrace `020` také: `leads` a `feedback` += `processing_basis text CHECK ('souhlas'|'opravneny_zajem')`. Pravidlo se váže k **tabulce, ne k přihlášení**: `leads` = vždy `souhlas` (jediné místo, kde se souhlas checkboxem skutečně sbírá), `feedback` = vždy `opravneny_zajem` (u palce se žádný souhlas nesbírá — anonymnímu hlasu nesmí spadnout titul `souhlas`, který nikdy nebyl udělen; konzistentní s D.1). Přihlášenost titul nemění, mění jen variantu textů na `/privacy` (G.5). Pozn. k implementaci: atribut `chat.authenticated` se odvozuje v [`chat/route.ts`](../../src/app/api/chat/route.ts) ř. 174, ne v `audience-access.ts`; na `POST /api/leads` a `/api/feedback` se dnes session vůbec nezjišťuje — bude-li potřeba (interní varianta textů, budoucí rozlišení), doplnit tam `getSessionUser()`. Pokud se A a G nasazují spolu, sloupce lze složit do migrace `019` a `020` vynechat.
- [x] **G.3.2** Sloupec zobrazit v `/admin/privacy` u nalezených záznamů — obsluha musí vidět, pod jakým titulem záznam vznikl, než ho vydá nebo smaže.

### G.4 Odvozený stav místo uloženého

- [x] **G.4.1** `src/components/DeploymentMode.tsx` — karta ve stylu [`SsoStatus.tsx`](../../src/components/SsoStatus.tsx): z reálných hodnot odvodí „veřejná / interní instance" a **upozorní na nesourodou kombinaci** (anonymní chat povolený spolu s `restricted` výchozí viditelností; interní instance se zapnutým sběrem poptávek). Odvozený stav nemůže zastarat a nemá vlastní zdroj pravdy.
- [x] **G.4.2** Umístit na `/admin/privacy` a kompaktně do patičky sidebaru, jako `SsoStatus`.

### G.5 Texty podle odvozeného stavu

- [x] **G.5.1** `/privacy` (D.1) má dvě varianty obsahu — veřejnou pro klienty a interní informaci pro zaměstnance (co nástroj zaznamenává, jak dlouho to drží, kdo se na to dívá) — volené odvozeným stavem, ne vlastním nastavením. Jinak se rozejde, co aplikace dělá, a co o sobě tvrdí.
- [x] **G.5.2** V interní variantě uvést informační povinnost vůči zaměstnancům (§ 316 zákoníku práce) a to, že báze může obsahovat údaje klientů, k nimž platí štítkové řízení přístupu.

### G.6 Retence účtů

- [x] **G.6.1** *(splněno spolu s F.1)* `docs/gdpr.md` kap. 6 popisuje postup pro ukončený pracovní poměr: dnes je v [`users/[id]/route.ts`](../../src/app/api/users/[id]/route.ts) jen deaktivace, skutečný výmaz po uplynutí retence zůstává ruční úkon obsluhy.

---

## Rizika a poznámky

- **Nevratnost výmazu.** `eraseSubject` maže natvrdo — proto potvrzovací dialog s vypsaným počtem záznamů a auditní zápis. Zásada „nemažeme, jen uzavíráme" (`leads/[id]/route.ts` ř. 9) tímto plánem **končí** pro retenci a výmaz na žádost; běžná obsluha poptávek zůstává beze změny (`closed`).
- **Cron a service-role klíč.** Routa `/api/cron/retention` maže data s klíčem, který obchází RLS. Slabý nebo chybějící `CRON_SECRET` = veřejná mazací routa — proto 503 při jeho absenci a `timingSafeEqual` při porovnání.
- **`retention_enabled` default false** je záměrná pojistka: chyba v lhůtách nebo v migraci nesmí umazat produkční data hned po nasazení.
- **Langfuse zůstává mimo dosah výmazu.** Když je `record_content` vypnutý, obsah tam není a `session_id` je pseudonym bez vazby na kontakt v samotném Langfuse. Kdyby se obsah zapnul, výmaz na žádost by se musel řešit i tam — další důvod nechat přepínač vypnutý.
- **Vercel logy** obsahují IP adresy mimo naši kontrolu; retence se řídí nastavením projektu, uvést v `/privacy`.

## Co tento plán vědomě neřeší (produkční dluh)

- **Právní posouzení textů.** `/privacy` a text souhlasu jsou funkční draft, ne právní stanovisko.
- **`users`** — mazání zaměstnaneckých účtů zůstává u deaktivace; jde o jiný právní titul a týká se auditní stopy.
- **Samoobslužný výmaz pro subjekt** (potvrzovací odkaz mailem) — vyžadoval by odesílání pošty a novou veřejnou routu; identitu ověřuje obsluha.
- **Záznam o činnostech zpracování (čl. 30)** a postup při porušení zabezpečení — mimo zvolený rozsah, `docs/gdpr.md` k nim tvoří podklad.
- **SEC-7 / SEC-8** zůstávají odloženým dluhem, s GDPR nesouvisí.

## Ověření

1. **Migrace:** `supabase db push` projde; `select retention_enabled, retention_leads_months, retention_feedback_months from app_settings where id = 1` vrátí `false, 24, 6`.
2. **Retence vypnutá:** `POST /api/privacy/retention` jako admin vrátí `skipped: true` a nic nesmaže.
3. **Retence zapnutá:** v DB nastavit u testovací poptávky `updated_at` o 25 měsíců zpět a u řádku `feedback` `created_at` o 7 měsíců zpět → ruční spuštění oba smaže, novější řádky nechá, do `privacy_actions` přibude řádek s počty.
4. **Cron:** `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/retention` → 200; bez hlavičky a s chybným secretem → 401; s odebraným `CRON_SECRET` → 503.
5. **Autorizace:** `/api/privacy/*` bez cookie → 401 (proxy), jako `viewer` → 403 (`requireAppRole`).
6. **Výmaz na žádost:** poslat z chatu poptávku a k odpovědi dát palec dolů (stejné `session_id`) → `/admin/privacy` najde poptávku i zpětnou vazbu, JSON export obsahuje obojí, po výmazu vrátí hledání prázdno a v DB nezůstane ani řádek `feedback`.
7. **Normalizace:** poptávka odeslaná jako `Jan.Novak@Firma.CZ` se najde i po zadání `jan.novak@firma.cz`; telefon `+420 777 123 456` se najde jako `777123456`.
8. **Transparence:** `/privacy` je dostupná bez přihlášení, odkaz funguje z patičky chatu, z widgetu na `/demo` i z karty poptávky; souhlas nejde zaškrtnout omylem (submit zůstává disabled).
9. **Telemetrie:** po vypnutí `record_content` má nová trace v Langfuse `Input: null`, ale stále nese `chat.query_length`, `session.id` a `prompt_hash`.
10. **Regrese:** `npm run build`, `npm run lint`, `npx tsc --noEmit`; odeslání poptávky a hlasování v chatu fungují beze změny.
11. **Hranice nasazení (G.1):** bez `PUBLIC_CHAT` vrací `POST /api/chat` i `POST /api/leads` bez cookie 401 a `/` i `/demo` přesměrují na login; se zapnutým `PUBLIC_CHAT` je vše veřejné jako dnes.
12. **Sběr poptávek (G.2):** po vypnutí `lead_capture_enabled` se v odpovědích neobjeví token `[[NABIDKA]]`, karta se nevykreslí ani po palci dolů a přímé volání `POST /api/leads` vrátí 403; palec dolů se dál ukládá do `feedback`.
13. **Právní titul (G.3):** poptávka dostane `souhlas` a hlas `opravneny_zajem` — nezávisle na tom, zda je volající přihlášený (hlas od anonyma i od přihlášeného shodně `opravneny_zajem`); obojí je vidět v `/admin/privacy`.
14. **Odvozený stav (G.4):** kombinace `PUBLIC_CHAT` zapnutý + `default_document_visibility = restricted` vypíše varování o nesourodé konfiguraci.
