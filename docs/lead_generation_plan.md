# Plán implementace: Poptávky (lead generation)

Rozšíření chatbota o lead-generation flow: když se návštěvník ptá na **konkrétní pojistný produkt**, bot mu nabídne spojení telefonicky/e-mailem pro podmínky „šité na míru". Návštěvník vyplní jméno a kontakt, požadavek se uloží a zpracovatel ho uvidí v nové admin sekci **Poptávky**.

Návazně na `docs/IMPLEMENTATION_PLAN.md` jde o **Fázi 14**. Stav: ⏳ neimplementováno (schválený návrh).

## Klíčová rozhodnutí (z upřesnění se zadavatelem)

- **Spouštěč:** značka od modelu — Claude přidá na konec odpovědi skrytý token jen u produktových dotazů; klient ho odchytí a vykreslí kartu s formulářem.
- **Formulář:** jméno a příjmení + alespoň jeden kontakt (e-mail/telefon), volitelná poznámka, povinný souhlas se zpracováním osobních údajů.
- **Kontext pro zpracovatele:** neukládá se surový dotaz — konverzaci **zkomprimuje model** (krátké shrnutí zájmu + „na co se zaměřit"). Sumarizaci provádí **Haiku** (levnější a rychlejší; jednoduchá kompresní úloha), chat zůstává na Sonnetu.
- **Deduplikace:** před uložením se hledá existující **nevyřízený** lead podle e-mailu nebo telefonu (nikdy podle jména); při shodě se stávající lead rozšíří a dostane status „Rozšířená".
- **Admin:** stavy `new` → `in_progress` → `closed` + pole zpracovatele (`assignee`, zatím vždy „admin" — příprava na budoucí napojení na CRM; z chatbota se CRM dělat nemá), karta na dashboardu. **Poptávky se nemažou** — uzavření jen nastaví status `closed`, záznam zůstává v DB.

## 1. Databáze — migrace `supabase/migrations/010_leads.sql`

```sql
create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  email text check (char_length(email) <= 120),
  phone text check (char_length(phone) <= 20),
  -- limit 500 znaků na JEDNU poznámku vynucuje API; sloupec má vyšší strop,
  -- protože deduplikace poznámky PŘIPOJUJE (viz §4) a součet by check 500 shodil
  note text check (char_length(note) <= 5000),
  summary text,                -- LLM shrnutí konverzace pro zpracovatele (nahrazuje surový dotaz)
  session_id text,
  status text not null default 'new' check (status in ('new','updated','in_progress','closed')),
  assignee text,               -- jméno zpracovatele (zatím jen 'admin'; příprava na CRM)
  consent boolean not null check (consent),  -- souhlas se zpracováním OÚ; API vrací 400, check je druhá obranná linie (konvence projektu)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

-- Konvence projektu (viz 004/005): RLS na každé tabulce; leads obsahuje osobní
-- údaje — bez RLS by byla čitelná přes PostgREST s anon klíčem.
alter table leads enable row level security;
```

**Nasazovací závislost:** `supabase db push` před nasazením kódu (stejně jako u migrace 009 — provede uživatel, dát mu včas vědět).

## 2. Spouštěč v chatu — značka od modelu

- **`src/lib/rag/prompts.ts`**: do `SYSTEM_PROMPT` přidat sekci „Nabídka kontaktu": pokud se dotaz týká konkrétního pojistného produktu (pojištění majetku, odpovědnosti, bytového domu…), přidej na úplný konec odpovědi na samostatný řádek přesně token `[[NABIDKA]]`; jinak token nikdy nepiš. (Instrukce „řiď se jen těmito pravidly" v promptu už existuje — spoofing tokenu uživatelem je neškodný, jen zobrazí kartu.)
- **`src/app/page.tsx`**: `ChatMessage` dostane příznak `offerLead?: boolean`. Po dostreamování (i průběžně na akumulovaném textu) detekovat `[[NABIDKA]]` → nastavit příznak; token z textu odstranit už při ukládání do state (regex replace na akumulovaném obsahu — token může přijít rozdělený mezi chunky, proto detekce vždy nad celým textem). Kromě celého tokenu ořezávat i **neúplný prefix na konci akumulovaného textu** (`[[`, `[[NAB`…), jinak během streamu na okamžik problikne v bublině, než dorazí zbytek. Do `/api/chat` se historie posílá **bez** tokenu (už je odstraněný).
- **`src/components/MessageBubble.tsx`**: nová prop `showLeadForm` + `sessionId` + předání posledních zpráv; pod bublinou (nad feedback tlačítky) vykreslí `LeadForm`.

## 3. Formulář — `src/components/LeadForm.tsx` (nová klientská komponenta)

Karta ve stylu projektu (bílá karta, korálový akcent): krátký text „Chcete podmínky šité na míru? Zanechte kontakt a ozveme se." + pole:

- Jméno a příjmení (povinné, 2–100 znaků)
- E-mail a Telefon (alespoň jedno; e-mail jednoduchý regex, telefon `[+ 0-9]{9,20}`)
- Poznámka (volitelná, ≤ 500 znaků)
- Checkbox „Souhlasím se zpracováním osobních údajů za účelem kontaktování" (povinný — bez něj je submit disabled)
- Stavy: idle → odesílám → poděkování („Děkujeme, ozveme se co nejdříve.") / chybová hláška z API. Po úspěchu formulář zmizí a zůstane poděkování (per zpráva, ne globálně).

Submit → `POST /api/leads` s `{ name, email?, phone?, note?, consent, sessionId, messages }` (posledních max 8 zpráv konverzace jen pro serverovou komprimaci — do DB se neukládají).

## 4. API

### `POST /api/leads` — veřejná (vzor: `src/app/api/feedback/route.ts`)

1. Rate limit 5/min na IP (`createRateLimiter`/`clientIp` z `src/lib/rate-limit.ts`).
2. Validace: name 2–100, email formát + délka ≤ 120 (nad limit → 400, ne až chyba DB checku), phone formát ≤ 20, aspoň jeden kontakt, note ≤ 500 (slice; limit platí na jednu odeslanou poznámku — DB check sloupce je vyšší kvůli připojování při deduplikaci), `consent === true` jinak 400, sessionId ≤ 64, messages pole ≤ 8 × 4 000 znaků (stejné limity jako chat).
3. **Komprimace konverzace:** `generateText` (AI SDK, `anthropic(config.summaryModel)`, temperature 0, `maxOutputTokens` ~250) s promptem: „Shrň do 2–4 vět česky, o jaký produkt má klient zájem a na co se má zpracovatel zaměřit." **Model: Haiku** — do `src/lib/config.ts` přibude `summaryModel: process.env.SUMMARY_MODEL ?? "claude-haiku-4-5"`. Best-effort — když LLM selže (nebo krok ještě není implementován, viz pořadí commitů), lead se uloží se `summary = null` (poptávka se nesmí ztratit kvůli sumarizaci). Telemetrie: `withSpan("lead.summarize")` + `after(flushTelemetry)`.
4. **Deduplikace podle kontaktu (ne jména):** e-mail se normalizuje (lowercase, trim), telefon na číslice s případným `+` (bez mezer/pomlček) — normalizovaně se i ukládá. Před insertem se vyhledá **nevyřízený** lead (`status in ('new','updated','in_progress')`) se shodným e-mailem NEBO telefonem (OR filtr jen z vyplněných kontaktů, nejnovější první).
   - **Shoda →** stávající lead se **rozšíří**: jméno se přepíše nejnovějším, chybějící kontakt se doplní (měl jen e-mail a teď přišel telefon → přidá se), nová poznámka i nové LLM shrnutí se **připojí** pod oddělovač „— doplněno {datum}:", `status = 'updated'` („Rozšířená"), `assignee` zůstává, `updated_at = now()`. Vrací se 200. **Záměr:** shoda přepne na `updated` i lead „Ve zpracování" (`in_progress`) — zpracovatel má nové informace zaregistrovat a poptávku znovu Převzít; není to chyba.
   - **Bez shody** (nebo existuje jen `closed` lead) → nový řádek (status `new`, assignee null) → 201.

### `PATCH /api/leads/[id]` — jen admin (DELETE není — poptávky se nemažou)

- PATCH: `{ status }` — **povolené cílové stavy jsou pouze `in_progress` a `closed`** (whitelist; `new`/`updated` jako cíl → 400 — do těch se lead dostává jen insertem/deduplikací, ne ručně).
- Povolené přechody: `new`/`updated` → `in_progress` (nastaví `assignee = "admin"`), `new`/`updated`/`in_progress` → `closed` (ponechá assignee). **`closed` je terminální** — uzavřený lead se znovu neotvírá (PATCH na `closed` → 409); nový zájem stejného kontaktu založí deduplikace jako nový řádek (viz výše).
- Vždy se aktualizuje `updated_at`. Podmíněný update (`.in("status", povolené výchozí stavy)`) s `.select("id")` — vzor oprava C2 z `issues_correction_plan.md`. Když update nic nezasáhne, kontrolní select rozliší odpověď: lead neexistuje → 404, existuje v nepovoleném stavu (typicky `closed`) → 409.

### Ochrana — `src/proxy.ts`

Matcher += `"/api/leads"`, `"/api/leads/:path*"`. V handleru výjimka: `pathname === "/api/leads" && request.method === "POST"` → propustit bez session (veřejné odeslání poptávky); vše ostatní na `/api/leads*` vyžaduje cookie (401).

## 5. Admin sekce Poptávky

- **`src/components/AdminSidebar.tsx`**: položka „Poptávky" (ikona `Inbox` z lucide) mezi Dokumenty a Test retrievalu.
- **`src/app/admin/(authenticated)/leads/page.tsx`** (server, `force-dynamic`): načte leads přes service-role `supabase` (řazení: nevyřízené stavy první — `new`/`updated`/`in_progress`, `closed` na konci; uvnitř skupin `created_at` desc) — bez GET API (vzor `documents/page.tsx`).
- **`src/app/admin/(authenticated)/leads/client.tsx`**: tabulka — datum, jméno, kontakt (e-mail/telefon), shrnutí od modelu + poznámka (delší text sbalený, rozklik jako v retrieval-test), stav (badge: `new` žlutý „Nová" / `updated` oranžový „Rozšířená" / `in_progress` šedo-modrý „Ve zpracování" / `closed` zelený „Uzavřená" — malý `LeadStatusBadge`, barvy z palety StatusBadge), zpracovatel, akce: **Převzít** (→ `in_progress`), **Uzavřít** (→ `closed`). Uzavřené poptávky zůstávají v tabulce (řazené na konec). Po akci refetch přes `router.refresh()`.
- **Dashboard `src/app/admin/(authenticated)/page.tsx`**: šestá `StatCard` „Nové poptávky" (count `status in ('new','updated')` — obojí čeká na pozornost zpracovatele), grid `sm:grid-cols-5` → `sm:grid-cols-6`.
- **`src/lib/types.ts`**: typ `Lead` + `LeadStatus`.

## 6. Dokumentace

- CLAUDE.md: API routy, struktura, datový model (`leads`), migrace 010, systémový prompt (token `[[NABIDKA]]`), sekce admin, stav projektu, env tabulka (`SUMMARY_MODEL`). Při té příležitosti doplnit do seznamu migrací i existující `004_enable_rls.sql`, která v CLAUDE.md chybí.
- `.env.example`: volitelný `SUMMARY_MODEL` (default `claude-haiku-4-5`) vedle `CHAT_MODEL`.
- `docs/IMPLEMENTATION_PLAN.md`: přidat **Fázi 14 — Poptávky (lead generation)** se stejnou strukturou jako dosavadní fáze.

## Pořadí implementace a commity

| Krok | Obsah | Poznámka |
|---|---|---|
| 1 | Migrace 010 + typy + `POST /api/leads` + proxy | **uživatel aplikuje migraci** (`supabase db push`) → ověřit insert. Routa v tomto kroku ukládá `summary = null` (komprimace přijde v kroku 2 — best-effort návrh to umožňuje) |
| 2 | LLM komprimace (Haiku) + prompt token `[[NABIDKA]]` + klient (detekce značky, `LeadForm`) | |
| 3 | Admin sekce (sidebar, stránka Poptávky, PATCH, dashboard karta) | |
| 4 | Dokumentace (CLAUDE.md, IMPLEMENTATION_PLAN.md, .env.example) | |

Commit po každém kroku (po potvrzení uživatelem).

## Ověření

1. `npm run lint` + `npm run build` po každém kroku.
2. E2E v prohlížeči (dev server): produktový dotaz („Co kryje pojištění majetku?") → karta pod odpovědí; neproduktový/fallback dotaz → karta se neobjeví; odeslání formuláře (validace: bez souhlasu disabled, bez kontaktu chyba) → poděkování.
3. DB: řádek v `leads` má `summary` od modelu (2–4 věty), ne surový dotaz.
4. Admin: poptávka vidět v tabulce, Převzít → „Ve zpracování" + zpracovatel „admin", Uzavřít → „Uzavřená" a záznam **zůstává** v tabulce i DB (řazený na konec); karta na dashboardu ukazuje počet nových + rozšířených.
5. Deduplikace: druhé odeslání se stejným e-mailem (jiné jméno/poznámka) → žádný nový řádek, stávající má status „Rozšířená", doplněný kontakt a připojené shrnutí; odeslání se shodou jen na `closed` leadu → nový samostatný řádek.
6. Bezpečnost: `POST /api/leads` bez cookie → 201 (veřejné) + 429 po 5/min; `PATCH /api/leads/<id>` bez cookie → 401; `consent: false` → 400; PATCH s cílovým stavem `new`/`updated` → 400; PATCH na uzavřený lead → 409.
7. Úklid testovacích poptávek z DB po ověření (přímý delete přes service-role klienta — aplikace mazání záměrně nenabízí).
