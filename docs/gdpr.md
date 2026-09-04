# GDPR — provozní příručka

Praktický návod pro toho, kdo Kecalo provozuje: jaké osobní údaje aplikace drží, jak dlouho, jak vyřídit žádost subjektu údajů a co je potřeba zařídit před ostrým provozem.

Doplňuje, nenahrazuje: technický popis je v [ARCHITECTURE.md, sekce 6.1](ARCHITECTURE.md#61-osobní-údaje-a-retence), rozhodnutí a jejich důvody v [plans/gdpr_plan.md](plans/gdpr_plan.md), veřejný text pro subjekty na `/privacy`.

**Tento dokument není právní stanovisko.** Popisuje, co aplikace technicky dělá. Právní posouzení konkrétního nasazení je na správci.

---

## 1. Mapa osobních údajů

| Kde | Co | Právní titul | Doba uchování | Jak se maže |
|---|---|---|---|---|
| `leads` | jméno, e-mail, telefon, poznámka, LLM shrnutí konverzace, `session_id` | souhlas (checkbox u karty poptávky) | `retention_leads_months`, výchozí 24 měsíců od **poslední** interakce | retenční úklid nebo výmaz na žádost |
| `feedback` | hodnocení, `session_id`, pořadí zprávy a **text dotazu — jen u palce dolů** | oprávněný zájem (kvalita služby) | `retention_feedback_months`, výchozí 6 měsíců od vzniku | retenční úklid nebo výmaz na žádost |
| `users` | jméno, příjmení, e-mail zaměstnance | plnění smlouvy / oprávněný zájem | bez automatické lhůty | ruční, viz kap. 6 |
| `privacy_actions` | HMAC otisk kontaktu, počty smazaných řádků, kdo úkon provedl | oprávněný zájem (doložitelnost, čl. 5 odst. 2) | neomezeně | nemaže se — je to auditní stopa |
| Langfuse | technická metadata; obsah dotazů **jen** při zapnutém `record_content` | oprávněný zájem (provoz) | dle nastavení projektu v Langfuse | mimo dosah výmazu v aplikaci |
| Vercel | provozní protokoly včetně IP adresy | oprávněný zájem (provoz, bezpečnost) | dle nastavení projektu ve Vercelu | mimo dosah výmazu v aplikaci |

Konverzace v chatu se **na server neukládá** — žije jen v paměti prohlížeče. V `localStorage` je jediná hodnota `kecalo_session_id`, náhodný identifikátor konverzace.

---

## 2. Retenční úklid

Lhůty se nastavují v `/admin/privacy` (jen role admin). Úklid maže:

- **poptávky** starší než lhůta podle `updated_at` — ne `created_at`. Opakovaná poptávka téhož kontaktu řádek aktualizuje, takže lhůta běží od poslední interakce se subjektem.
- **hodnocení** starší než lhůta podle `created_at`.

Běží dvěma cestami, obě přes stejnou implementaci:

| Cesta | Kdy | Autorizace |
|---|---|---|
| `GET /api/cron/retention` | denně ve 3:00 (rozvrh ve `vercel.json`) | `Authorization: Bearer $CRON_SECRET` |
| tlačítko **Spustit úklid teď** v `/admin/privacy` | na vyžádání | přihlášený admin |

**Po nasazení je úklid vypnutý** (`retention_enabled = false`). Je to záměrná pojistka: mazání je nevratné a první běh smaže najednou všechno, co je za lhůtou. Před zapnutím se vyplatí spočítat, kolika řádků se to týká.

Bez nastaveného `CRON_SECRET` vrací cron routa **503** a neběží. Je to bezpečnější než otevřená mazací routa — ale znamená to, že se úklid tiše neděje, dokud secret nedoplníte.

Každý běh zapíše řádek do `privacy_actions`, i když nic nesmazal. Doložitelné musí být, že úklid proběhl, ne jen že něco smazal.

---

## 3. Žádost o přístup a přenositelnost (čl. 15 a 20)

1. **Ověřte totožnost žadatele.** Aplikace to nedělá — vydá údaje komukoli, kdo zná kontakt. Ověření je na obsluze.
2. V `/admin/privacy` zadejte do pole **e-mail nebo telefon** subjektu a dejte Vyhledat.
3. Zkontrolujte nálezy: tabulka poptávek a tabulka navázaných hodnocení.
4. **Stáhnout JSON** vytvoří soubor s nalezenými daty — ten se předává subjektu.

E-mail se najde nezávisle na velikosti písmen, telefon i s předvolbou nebo bez ní.

---

## 4. Žádost o výmaz (čl. 17)

1. Ověřte totožnost žadatele (viz výše).
2. Vyhledejte kontakt v `/admin/privacy`.
3. **Než smažete, zvažte, zda výmazu nebrání jiná povinnost** — typicky rozpracovaná smluvní agenda nebo účetní a archivační lhůty. Aplikace tuhle kontrolu neumí, právo na výmaz není absolutní.
4. **Trvale smazat** → potvrzovací dialog vypíše počty → smaže poptávky i navázaná hodnocení.
5. Do `privacy_actions` se zapíše řádek s otiskem kontaktu; kontakt sám se do auditu neukládá.

Výmaz je **nevratný** a zálohy se nevrací zpět. Pořadí je hodnocení → poptávky, protože `session_id` z poptávky je jediná cesta k hodnocením.

---

## 5. Známé omezení dohledatelnosti

Hodnocení jde s osobou spojit **jen tehdy, pokud subjekt ve stejné konverzaci odeslal i poptávku**. Chat je jinak anonymní: `session_id` je náhodný identifikátor v prohlížeči, žádné účty koncových tazatelů neexistují.

Prakticky to znamená, že hodnocení z jiného zařízení, z jiného prohlížeče nebo od někoho, kdo poptávku nikdy neposlal, dohledat nelze. Není to chyba nástroje — takový údaj k osobě přiřadit nejde a jeho dohledání by vyžadovalo víc údajů, než dnes sbíráme. Žadateli to lze takto vysvětlit.

---

## 6. Zaměstnanecké účty

Účty v `/admin/users` se **nemažou, jen deaktivují** (`is_active = false`). Deaktivace okamžitě ukončí přihlášení a zamezí novému.

Po ukončení pracovního poměru a uplynutí doby, po kterou je potřeba účet držet (typicky kvůli auditní dohledatelnosti provedených úkonů), je **skutečný výmaz ruční úkon** — v aplikaci pro něj tlačítko není. Vyžaduje zásah v databázi a rozvahu, co udělat s auditními vazbami: `privacy_actions.performed_by` má `ON DELETE SET NULL`, takže smazání účtu auditní záznamy nesmaže, jen u nich zmizí jméno.

Zaměstnanecké účty **nejsou** součástí nástroje pro práva subjektu v `/admin/privacy` — jde o jiný právní titul a jinou agendu.

---

## 7. Zpracovatelé

| Zpracovatel | Co mu odchází | Umístění |
|---|---|---|
| Anthropic (Claude) | text dotazu a část konverzace | USA |
| Voyage AI | text dotazu (převod na vektor) | USA |
| Mistral AI | přepis konverzace při odeslání poptávky | EU (Francie) |
| Supabase | veškerá perzistence | ověřit region projektu |
| Langfuse | technická metadata; obsah jen při `record_content` | ověřit region instance |
| Vercel | provoz aplikace, IP v protokolech | USA |

U zpracovatelů mimo EU je potřeba mít vyřešený právní základ pro předání (standardní smluvní doložky nebo jiný nástroj podle kap. V GDPR).

---

## 8. Checklist před ostrým provozem

- [ ] Vyplnit identifikaci správce a kontaktní e-mail na `/privacy` — v kódu jsou zatím viditelné texty `DOPLNIT` ([`src/app/privacy/page.tsx`](../src/app/privacy/page.tsx), konstanta `CONTROLLER`)
- [ ] Doplnit skutečné regiony Supabase a Langfuse do tabulky zpracovatelů tamtéž
- [ ] Nechat zásady zpracování a text souhlasu zkontrolovat právníkem
- [ ] Uzavřít zpracovatelské smlouvy: Anthropic, Voyage, Mistral, Supabase, Langfuse, Vercel
- [ ] Ověřit region Supabase projektu a rozhodnout, zda vyhovuje
- [ ] Nastavit retenci v projektu Langfuse (aplikace na ni nedosáhne)
- [ ] Nastavit `CRON_SECRET` v prostředí (jinak cron vrací 503 a neuklízí)
- [ ] Zkontrolovat lhůty v `/admin/privacy` a **zapnout automatický úklid**
- [ ] Ověřit, že `record_content` je vypnutý (`/admin/parameters` → Telemetrie)
- [ ] Určit, kdo v organizaci žádosti subjektů vyřizuje a jak ověřuje totožnost

---

## 9. Co aplikace neřeší

- **Záznam o činnostech zpracování (čl. 30)** — tento dokument je pro něj podkladem, ne náhradou.
- **Postup při porušení zabezpečení (čl. 33/34)** — mimo rozsah aplikace.
- **Samoobslužný výmaz pro subjekt** — žádosti vyřizuje obsluha, aplikace nemá potvrzovací tok e-mailem.
- **Obsah už odeslaný do Langfuse** při dříve zapnutém `record_content` — výmaz na žádost tam nedosáhne, řeší se v Langfuse zvlášť.
