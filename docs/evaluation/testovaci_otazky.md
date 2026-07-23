# Testovací otázky pro RAG chatbota – Pojišťovna Jistota

Sada slouží k ověření funkčnosti chatbota po naindexování reálných seed dokumentů
Kooperativy (pojištění majetku a odpovědnosti občanů, pojištění bytových domů).
U každé otázky je uvedena očekávaná odpověď a zdroj, ze kterého má chatbot čerpat —
díky tomu poznáte, zda retrieval našel správný dokument a zda odpověď nehalucinuje.

> **Pozn. k brandingu:** Bot vystupuje jako fiktivní „Pojišťovna Jistota" (dle systémového
> promptu), znalostní bázi ale tvoří reálné dokumenty Kooperativy. Konkrétní kontakty
> uvedené v odpovědích (např. infolinka 957 105 105) jsou citovány z dokumentů; ve fallbacku
> bot odkazuje na vlastní infolinku dle systémového promptu.

Seed dokumenty (původní báze, na které sada původně vznikla):
- `VPP M-100_23 pro pojištění majetku a odpovědnosti občanů.pdf`
- `VPP M-200_23 pro pojištění bytových domů.pdf`
- `Informační dokument o pojistném produktu (IPID).pdf`
- `Informace pro klienta.pdf`

> **Pozn. (22. 7. 2026):** do báze mezitím přibyly další produkty (RENTA PROFIT, cestovní
> pojištění M-750, FLEXI, skupinové pojištění — vlastní sady `testovaci_otazky_*.md`).
> Otázky 11 a 12 v této sadě byly původně navržené jako fallback „mimo bázi" (životní a
> cestovní pojištění tehdy chyběly); po nahrání odpovídajících dokumentů jde nyní o věcné
> otázky V ROZSAHU — přesunuty do sekce A a přeznačeny.

---

## A. Otázky V ROZSAHU znalostní báze (chatbot má odpovědět věcně + uvést zdroj)

Sekce B (fallback) v této sadě zanikla — obě její původní otázky (životní a cestovní
pojištění) jsou po rozšíření báze věcně zodpověditelné, viz otázky 11 a 12 níže. Otázky na
fallback mimo bázi pokrývají sady jednotlivých produktů (`testovaci_otazky_*.md`, sekce B).

**1. Jaké varianty pojištění bytového domu si mohu sjednat?**
Očekáváno: Základní varianty PRIMA a KOMFORT; k variantě PRIMA lze navíc sjednat
připojištění PRIMA PLUS. KOMFORT kryje nad rámec živelních nebezpečí i krádež, loupež,
vandalismus, přepětí/podpětí/zkrat, zatečení srážek apod.
Zdroj: VPP M-200_23, část 2 a čl. 23; IPID.

**2. Kolik mi pojišťovna uhradí za náhradní ubytování, když se byt v pojištěném bytovém domě stane následkem pojistné události neobyvatelným?**
Očekáváno: Ve variantě KOMFORT do 25 000 Kč na náhradní ubytování obyvatel jednoho bytu,
nejvýše však 250 000 Kč za obyvatele všech takových bytů.
Zdroj: VPP M-200_23, čl. 29 odst. 13 písm. c).

**3. Jsem krytý, když povodeň poškodí dům pět dní po sjednání pojištění?**
Očekáváno: Ne — nastane-li škoda následkem povodně do 10 dnů po uzavření smlouvy,
pojišťovna z této události neplní.
Zdroj: VPP M-200_23, čl. 8 odst. 3 (shodně VPP M-100_23, čl. 8 odst. 3; IPID).

**4. Jaká je spoluúčast u pojištění elektromotorů a jaký je jejich roční limit plnění?**
Očekáváno: Spoluúčast 10 % z celkové výše pojistného plnění; limit plnění ze všech
pojistných událostí v jednom pojistném roce činí 50 000 Kč.
Zdroj: VPP M-200_23, čl. 29 odst. 10.

**5. Co se podle podmínek považuje za „bytový dům"?**
Očekáváno: Budova se čtyřmi a více samostatnými byty, ve které nejméně třetina podlahové
plochy slouží k trvalému obývání (není-li v pojistné smlouvě ujednáno jinak).
Zdroj: VPP M-200_23, čl. 44 odst. 3.

**6. Do kdy můžu vypovědět smlouvu po jejím uzavření a jaká je výpovědní doba?**
Očekáváno: Do dvou měsíců ode dne uzavření pojistné smlouvy; pojištění zanikne uplynutím
osmidenní výpovědní doby.
Zdroj: Informace pro klienta, kap. 7 — totéž ustanovení je i v ostatních produktech
(např. VPP M-200_23, čl. 4 odst. 3); s rostoucí bází (7 dokumentů) retrieval nemusí vždy
vrátit zrovna „Informace pro klienta" mezi top-k, ale fakticky správnou odpověď najde
i v jiném zdroji — otázka proto v CSV datasetu nemá pevně připnutý `document`.

**7. Za jak dlouho po skončení šetření vyplatíte pojistné plnění?**
Očekáváno: Do 15 dnů ode dne skončení šetření nutného ke zjištění existence a rozsahu
povinnosti plnit. (Samotné šetření má skončit do 3 měsíců od oznámení.)
Zdroj: VPP M-200_23, čl. 12 odst. 3 (shodně VPP M-100_23, čl. 12 odst. 3).

**8. Můžu uplatnit připojištění prodloužené záruky na osmiletou pračku?**
Očekáváno: Ne — spotřebič nesmí být starší 6 let (počítáno od doloženého data zakoupení
jako nové věci). Pračka mezi kryté spotřebiče patří, ale stáří 8 let nárok vylučuje.
Zdroj: VPP M-100_23, čl. 31 odst. 2 a odst. 3 písm. b).

**9. Vztahuje se pojištění odpovědnosti v běžném občanském životě i na újmu způsobenou v zahraničí?**
Očekáváno: Ano — plní se z pojistných událostí, při nichž újma i její příčina nastaly
na území celého světa. (Naproti tomu odpovědnost z vlastnictví nemovitosti platí jen
na území ČR.)
Zdroj: VPP M-100_23, čl. 37 odst. 7 (a čl. 38 odst. 5).

**10. Jak a kde nahlásím pojišťovně pojistnou událost?**
Očekáváno: Telefonicky na infolince 957 105 105, online formulářem na www.koop.cz, osobně
na pobočce nebo písemně. Při podezření na trestný čin (krádež) volat policii 158, při požáru
hasiče 150.
Zdroj: Informace pro klienta, kap. 5 — obdobný postup hlášení popisují i ostatní produkty;
otázka proto v CSV datasetu nemá pevně připnutý `document` (viz pozn. u otázky 6).

**11. Nabízíte životní pojištění a jaké má krytí?**
Očekáváno: Ano — v bázi jsou dva produkty životního pojištění: RENTA PROFIT (obnosové
pojištění pro případ smrti nebo dožití) a FLEXI (komplexní životní pojištění s investiční
složkou a řadou zdravotních/úrazových připojištění — invalidita, vážná onemocnění,
pracovní neschopnost, hospitalizace). Chatbot má rozlišit oba produkty, ne je směšovat.
Zdroj: RENTA_PROFIT a FLEXI (obě dokumentace „VÍTEJTE V KOOPERATIVĚ" / úvodní části).

**12. Jaký je limit léčebných výloh u vašeho cestovního pojištění?**
Očekáváno: Podle varianty — KLASIK 10 000 000 Kč, PLUS 100 000 000 Kč na každou pojištěnou
osobu (plus dílčí sublimity, např. zásah záchranných složek 500 000 / 1 000 000 Kč, zubní
ošetření 20 000 / 30 000 Kč).
Zdroj: M-750, Předsmluvní informace, Základní informace, bod 13 (Přehled variant pojištění),
písm. a), str. 10.

---

## Doporučený demo scénář pro kurz

1. Před indexací: položit otázku 1 → chatbot nemá data → fallback.
2. Nahrát seed dokumenty (VPP M-100, VPP M-200, IPID, Informace pro klienta), počkat na dokončení indexace.
3. Položit otázku 1 → správná odpověď se zdrojem (varianty pojištění bytového domu).
4. Navazující otázka „A jaký je u varianty KOMFORT limit na náhradní ubytování?" → test kontextu konverzace (otázka 2).
5. Položit otázku mimo bázi (např. „Jaký je limit léčebných výloh u vašeho cestovního
   pojištění?" — dokud není nahrané `M-750`) → fallback „nevím" (test, že bot nehalucinuje).
6. Smazat dokument `VPP M-200_23 pro pojištění bytových domů.pdf`.
7. Znovu položit otázku 2 (náhradní ubytování) → fallback / chybějící zdroj (ověření, že smazaný dokument zmizel z báze).
