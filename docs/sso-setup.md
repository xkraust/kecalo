# Zapnutí SSO (přihlášení firemním účtem)

Návod pro nasazení přihlašování přes firemní identity provider (OIDC). Část
kroků dělá správce firemního tenantu, část správce Kecala — u každého kroku je
uvedeno, kdo ho provádí.

Technický návrh a rozhodnutí, která za implementací stojí, jsou v
[plánu rolí](plans/roles_and_document_access_plan.md), kapitola 9.

---

## Co SSO v Kecalu dělá a co ne

**Dělá:**

- přihlášení firemním účtem včetně MFA (to celé řeší identity provider),
- **automatické založení účtu** při prvním přihlášení — nikoho není potřeba
  zakládat předem,
- **přidělení pracovních rolí podle skupin** v IdP, a z nich odvozených štítků,
  které rozhodují, jaké dokumenty uživatel vidí,
- průběžnou synchronizaci: každé další přihlášení role podle skupin přepíše.

**Nedělá:**

- neukládá hesla SSO účtů (Kecalo je nezná a znát nemůže),
- **nepřiděluje aplikační role** — každý nový SSO účet je vždy `viewer`
  a povýšit ho musí správce v administraci,
- nenahrazuje přihlášení heslem; lokální účty fungují dál vedle SSO.

---

## Předpoklady

| Co | Kdo zajistí |
|---|---|
| Přístup do administrace firemního tenantu (Entra ID, Keycloak…) | IT / správce identit |
| Možnost změnit proměnné prostředí u nasazené aplikace a spustit redeploy | správce Kecala |
| Veřejná adresa aplikace přes HTTPS | — |
| Seznam skupin v IdP, které mají odpovídat oddělením | IT + zadavatel |

> **HTTPS je povinné.** Knihovna `openid-client` odmítá HTTP a Kecalo dělá
> výjimku pouze pro `localhost` (kvůli testu s mock providerem, viz níže).

---

## Krok 1 — Registrace aplikace u identity providera

*Provádí: správce firemního tenantu*

### Entra ID (Microsoft)

1. Entra admin center → **App registrations** → *New registration*
2. Název aplikace (např. „Kecalo"), typ účtů: pouze účty ve vaší organizaci
3. **Redirect URI** typu *Web*:
   ```
   https://vase-domena.cz/api/auth/oidc/callback
   ```
   Adresa musí souhlasit **na znak**, včetně protokolu a bez koncového lomítka —
   aplikace ji posílá při výměně kódu a IdP ji porovnává přesnou shodou.
4. Po vytvoření opsat **Application (client) ID** a **Directory (tenant) ID**
5. **Certificates & secrets** → *New client secret* → opsat **Value**
   (ne Secret ID; hodnota se zobrazí jen jednou)
6. **Token configuration** → *Add groups claim* → vybrat *Security groups*

Issuer má pro Entra ID tvar:
```
https://login.microsoftonline.com/<tenant-id>/v2.0
```

> ### ⚠️ Past: Entra ID posílá GUID, ne názvy skupin
>
> V claim `groups` přicházejí **Object ID skupin** (např.
> `8f4c1b2e-3d5a-4f2b-9c81-7e6d0a1b2c3d`), ne jejich názvy. Do pole
> **Skupina v IdP** u pracovní role se tedy zadává GUID, který se zkopíruje
> z Entra ID, nikoli „Obchod".
>
> Alternativa je v *Token configuration* přepnout na `sAMAccountName`, pak
> chodí názvy — **funguje to ale jen pro skupiny synchronizované z on-premise
> AD**, ne pro cloud-only skupiny. Ověřte s IT dřív, než začnete zakládat role.

### Keycloak

Jednodušší: posílá názvy skupin. Issuer je
`https://keycloak.firma.cz/realms/<realm>`, klienta založíte v *Clients* →
*Create*, typ *confidential*, s toutéž redirect URI. Skupiny je potřeba
přidat jako mapper typu *Group Membership* s názvem claimu `groups`.

### Google Workspace

Přihlášení funguje, **automatické přidělování rolí ne** — Google skupiny
v ID tokenu neposílá a musely by se dotahovat přes Admin SDK, což Kecalo
neumí. Pracovní role by se přidělovaly ručně, jenže u SSO účtů je nelze
měnit v administraci. Google Workspace tedy dává smysl jen tam, kde všichni
uživatelé vidí totéž.

---

## Krok 2 — Proměnné prostředí

*Provádí: správce Kecala*

Na Vercelu v **Project Settings → Environment Variables** (prostředí
*Production*, případně i *Preview*), pak **redeploy** — proměnné se načítají
při startu aplikace.

```bash
OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_CLIENT_ID=<application-id>
OIDC_CLIENT_SECRET=<hodnota secretu>

# Volitelné
OIDC_GROUPS_CLAIM=groups                        # default „groups"
OIDC_REDIRECT_BASE_URL=https://vase-domena.cz   # jen když se origin liší od veřejné adresy (proxy)
```

**Kontrola:** v administraci ukazuje stav konfigurace indikátor — v patičce
levého menu („SSO aktivní" / „SSO neaktivní") a podrobněji na stránce
**Uživatelé**. Při neúplné konfiguraci vypíše, **která proměnná chybí**, což
odhalí překlep nebo zapomenutý secret; vidí ho jen role *Admin*.

Jakmile jsou všechny tři povinné proměnné nastavené, objeví se na přihlašovací
stránce tlačítko **„Přihlásit přes firemní účet"**. Chybí-li kterákoli, je SSO
celé vypnuté a nikde se nenabízí — **žádný přepínač v administraci neexistuje**,
konfigurace je jediným vypínačem.

---

## Krok 3 — Příprava v administraci

*Provádí: správce Kecala — **před** tím, než se lidé začnou přihlašovat*

Bez tohoto kroku se účty sice založí, ale nebudou mít žádná oprávnění ani
přístup k omezeným dokumentům.

1. **`/admin/users/audiences`** — založit štítky dokumentů podle oddělení
   (Právní oddělení, Obchod, Účtárna…). Název se píše česky, technický kód se
   odvodí sám.
2. **`/admin/users/job-roles`** — založit pracovní role, přiřadit jim štítky
   a vyplnit **Skupina v IdP** (u Entra ID onen GUID). Jedna skupina smí
   mapovat nejvýš na jednu roli.
3. **`/admin/documents`** — u interních dokumentů přepnout **Viditelnost** na
   *Omezený* a přiřadit štítky. Dokument označený jako omezený **bez štítků**
   nevidí nikdo kromě adminů.
4. **`/admin/parameters` → Provozní režim** — zvážit přepnutí na *Omezené*, aby
   nově nahrané dokumenty nebyly automaticky dostupné veřejnému chatu.

---

## Krok 4 — Ověření

1. Otevřít přihlašovací stránku — musí být vidět tlačítko „Přihlásit přes
   firemní účet".
2. Přihlásit se testovacím účtem, který je členem některé namapované skupiny.
3. V `/admin/users` zkontrolovat, že účet vznikl, má roli **Čtenář** a u sloupce
   *Pracovní role* jsou role odpovídající skupinám (u SSO účtů jsou read-only
   s poznámkou „spravuje se přes skupiny v IdP").
4. Povýšit účet na *Editor* nebo *Admin*, pokud má mít víc než čtení.
5. Ověřit viditelnost: přihlášený uživatel musí v `/admin/documents` nebo v testu
   retrievalu vidět dokumenty svého oddělení a nevidět cizí.

---

## Co se děje při přihlášení

1. Uživatel klikne na tlačítko → přesměrování na IdP → ověření včetně MFA.
2. IdP vrátí aplikaci token; ta ověří jeho podpis, vydavatele, platnost
   a jednorázové hodnoty (`state`, `nonce`, PKCE).
3. Kecalo hledá účet podle dvojice **vydavatel + subjekt** z tokenu — nikdy
   podle e-mailu. Adresa se totiž mění (svatba, přejmenování domény) a párování
   přes ni je klasická cesta k převzetí účtu.
4. Účet buď najde, nebo **založí** (`Čtenář`, bez hesla).
5. Skupiny z tokenu přeloží na pracovní role a **přepíše** jimi stávající sadu.
6. Vydá běžnou přihlašovací cookie — od té chvíle se aplikace chová stejně jako
   u účtu s heslem.

---

## Provozní důsledky

- **Správa přístupu k dokumentům se přesouvá na IT.** Kdo spravuje členství ve
  skupinách v Entra ID, rozhoduje o tom, co lidé v Kecalu vidí. Správce Kecala
  rozhoduje už jen o aplikačních rolích a o označkování dokumentů.
- **Přeložení mezi odděleními se propíše samo** při dalším přihlášení; opuštěná
  oprávnění nepřežijí. Změna sady rolí zároveň ukončí ostatní běžící přihlášení
  dotčeného uživatele.
- **Osobní údaje SSO účtů (jméno, příjmení, e-mail) jsou v administraci
  read-only** — zdrojem pravdy je IdP a ruční změnu by příští přihlášení
  přepsalo.
- **Nechte si lokální admin účet.** Je to záložní cesta dovnitř, kdyby IdP
  vypadl nebo byla konfigurace špatně. Nemazat ani po zapnutí SSO.
- **Zapnutí SSO nikoho automaticky nepřihlásí.** Uživatelé musí sami kliknout na
  tlačítko; přihlášení heslem funguje dál pro lokální účty.

---

## Řešení problémů

Chyba se po nezdařeném pokusu zobrazí na přihlašovací stránce. Podrobnost je
v serverovém logu (na Vercelu ve *Functions* → *Logs*).

| Hláška na stránce | Kód v URL | Co s tím |
|---|---|---|
| Přihlášení přes firemní účet není nastavené. | `sso_disabled` | Chybí některá z povinných proměnných, nebo neproběhl redeploy. |
| Firemní přihlášení je dočasně nedostupné. | `sso_unavailable` | Nepodařilo se stáhnout konfiguraci IdP — špatný `OIDC_ISSUER`, výpadek IdP, nebo blokovaný odchozí provoz. |
| Přihlášení vypršelo nebo bylo přerušeno. | `sso_state` | Uživatel se vracel po víc než 10 minutách, měl zakázané cookies, nebo otevřel odkaz na callback přímo. Zkusit znovu. |
| Od firemního účtu nedorazily potřebné údaje. | `sso_claims` | Token neobsahuje `iss`/`sub` — zkontrolovat scope a konfiguraci tokenu u IdP. |
| Účet nejde v Kecalu založit. | `sso_account` | Nejčastěji **kolize e-mailu s existujícím lokálním účtem**. Jeden z účtů přejmenovat. |
| Firemní přihlášení se nezdařilo. | `sso_failed` | Obecná chyba — neplatný podpis tokenu, špatný client secret, nesouhlasící redirect URI. Detail je v logu. |

**Uživateli se založil účet, ale nemá žádné pracovní role.** Skupina z IdP není
namapovaná — zkontrolovat pole *Skupina v IdP* u pracovní role. U Entra ID
ověřit, že je tam **GUID**, ne název skupiny (viz past v kroku 1).

**Uživatel nevidí žádné dokumenty.** Buď nemá pracovní roli, nebo role nemá
přiřazené štítky, nebo dokumenty nejsou označkované. Rychlá kontrola:
`/admin/users` → sloupec *Pracovní role* ukazuje pod rolemi i odvozené štítky.

---

## Vyzkoušení bez firemního tenantu

Celý tok jde ověřit lokálně proti fiktivnímu provideru:

```bash
node scripts/mock-idp.mjs --groups=Obchod
```

Do `.env.local` pak:

```bash
OIDC_ISSUER=http://localhost:9090
OIDC_CLIENT_ID=kecalo-test
OIDC_CLIENT_SECRET=test-secret
```

Mock provider přeskakuje přihlašovací obrazovku a vydá token komukoli — slouží
**výhradně** k lokálnímu ověření a nikdy nesmí být nastavený v produkci.
Parametry `--sub`, `--email`, `--givenName`, `--familyName` a `--groups`
umožňují simulovat různé uživatele a členství ve skupinách.
