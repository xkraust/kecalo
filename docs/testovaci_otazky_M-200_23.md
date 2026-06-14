# Testovací otázky – VPP M-200/23 (pojištění bytových domů, Kooperativa)

Sada k ověření RAG chatbota nad dokumentem `VPP_M-200_23`. U každé otázky je
očekávaná odpověď a článek, ze kterého má chatbot čerpat. Dokument je rozsáhlý
a obsahuje hodně podobně znějících pasáží (limity, výluky, definice), takže je
to dobrý test přesnosti retrievalu — pozor zejména na otázky, kde se správná
hodnota liší podle varianty (PRIMA vs KOMFORT) nebo kde se snadno splete
podobný pojem.

---

## A. Faktické otázky V ROZSAHU (přesná hodnota / definice)

**1. Jaký je roční limit plnění pro pojištění elektromotorů?**
Očekáváno: 50 000 Kč; spoluúčast 10 % z pojistného plnění.
Zdroj: čl. 29 odst. 10.

**2. Do jaké výše se hradí zachraňovací náklady při záchraně života nebo zdraví osob?**
Očekáváno: až 30 % z horní hranice pojistného plnění (běžně jen 10 %).
Zdroj: čl. 13 odst. 2 a 3.

**3. Jaká rychlost větru se považuje za vichřici?**
Očekáváno: 20,8 m/s a vyšší.
Zdroj: čl. 44 odst. 59 (výklad pojmů).

**4. Od jakého stupně mezinárodní stupnice se uznává zemětřesení jako pojistná událost?**
Očekáváno: alespoň 6. stupeň stupnice EMS-98, měřeno v místě pojištění (ne v epicentru).
Zdroj: čl. 44 odst. 68.

**5. Do kolika dnů je splatné pojistné plnění po skončení šetření?**
Očekáváno: do 15 dnů od skončení šetření.
Zdroj: čl. 12 odst. 3.

**6. Jak dlouho má pojišťovna na ukončení šetření škodné události?**
Očekáváno: nejpozději do 3 měsíců od obdržení oznámení.
Zdroj: čl. 12 odst. 1.

**7. Jaký je limit na náhradní ubytování ve variantě KOMFORT?**
Očekáváno: 25 000 Kč na jeden byt, nejvýše 250 000 Kč za všechny byty.
Zdroj: čl. 29 odst. 13 písm. c.

**8. Kdy je územní platnost pojištění omezena?**
Očekáváno: újma i její příčina musí nastat na území ČR, není-li ujednáno jinak.
Zdroj: čl. 9.

**9. Co se stane, pokud škoda vznikne povodní do 10 dnů od uzavření smlouvy?**
Očekáváno: pojišťovna není povinna z této události plnit.
Zdroj: čl. 8 odst. 3.

**10. Co se rozumí podpojištěním a jaký má důsledek?**
Očekáváno: pojistná částka je nižší než pojistná hodnota; pojišťovna může snížit
plnění ve stejném poměru. Při souhlasu s indexací se podpojištění neuplatní.
Zdroj: čl. 27.

---

## B. Otázky závislé na VARIANTĚ (test, zda chatbot rozliší PRIMA vs KOMFORT)

**11. Kryje varianta PRIMA krádež vloupáním?**
Očekáváno: Ne — krádež s překonáním překážky, loupež a vandalismus jsou jen
ve variantě KOMFORT (PRIMA kryje živelní nebezpečí). Lze připojistit PRIMA PLUS.
Zdroj: čl. 23 (PRIMA odst. 1–4, KOMFORT odst. 5).

**12. Jaký je limit plnění na movité předměty u varianty KOMFORT?**
Očekáváno: 200 000 Kč (u varianty PRIMA jen 100 000 Kč).
Zdroj: čl. 29 odst. 11 a 13.

**13. Je škoda způsobená přepětím nebo zkratem kryta ve variantě PRIMA?**
Očekáváno: Ne — přepětí, podpětí a zkrat jsou kryty ve variantě KOMFORT
(limit 500 000 Kč/rok). Zabudované elektromotory jsou proti zkratu/přepětí
kryty v obou variantách.
Zdroj: čl. 23 odst. 3 a 5, čl. 29 odst. 14.

---

## C. Otázky na definice / rozlišení podobných pojmů (záludné pro retrieval)

**14. Jaký je rozdíl mezi povodní a záplavou podle těchto podmínek?**
Očekáváno: Povodeň = přechodné zvýšení hladiny toku, voda zaplavuje mimo koryto;
záplava = vytvoření souvislé vodní plochy, která stojí nebo proudí v místě pojištění.
Zdroj: čl. 44 odst. 30 a 65.

**15. Co je „krádež s překonáním překážky"?**
Očekáváno: krádež, u které jsou zjištěny stopy prokazující překonání překážky
(např. zpřístupnění nevhodným nástrojem, vniknutí jinak než vstupním otvorem,
neoprávněně získaný klíč…).
Zdroj: čl. 44 odst. 8.

**16. Co znamená pojištění na novou cenu?**
Očekáváno: plnění odpovídá nákladům na znovupořízení nové srovnatelné věci.
Pokud zůstatková hodnota klesla pod 30 % nové ceny, plní se v časové ceně.
Zdroj: čl. 26 a čl. 29 odst. 3.

---

## D. Otázky na ODPOVĚDNOST (část 3 dokumentu)

**17. Jaký je roční souhrnný limit u pojištění odpovědnosti?**
Očekáváno: maximálně dvojnásobek limitu plnění sjednaného ve smlouvě za pojistný rok.
Zdroj: čl. 42 odst. 2.

**18. Vztahuje se pojištění odpovědnosti na újmu způsobenou úmyslně?**
Očekáváno: Ne — úmyslně způsobená újma (včetně svévole/škodolibosti) je vyloučena.
Zdroj: čl. 38 odst. 1 písm. a.

---

## E. Otázky MIMO znalostní bázi (test fallbacku „nevím")

Chatbot NESMÍ odpověď vymyslet — má přiznat, že informace v dokumentu není,
a odkázat na pojišťovnu.

**19. Kolik stojí pojištění bytového domu o ploše 800 m²?**
Očekáváno: Fallback — dokument neuvádí žádné ceny/sazby pojistného, jen pravidla.
Chatbot nesmí vymyslet částku.

**20. Vztahuje se toto pojištění i na pojištění vozidel obyvatel domu?**
Očekáváno: Fallback — dokument se týká bytového domu, movitých předmětů ke správě
a odpovědnosti; pojištění vozidel obyvatel zde řešeno není.

**21. Jaká je spoluúčast u pojištění skel?**
Očekáváno: Fallback / opatrná odpověď — čl. 31 (připojištění skel) konkrétní
spoluúčast neuvádí (řeší se limitem plnění a smlouvou). Dobře nastavený chatbot
by neměl spoluúčast vymyslet; konkrétní číslo v podmínkách není.

---

## Poznámka k tomuto dokumentu pro účely kurzu

Tohle je „ostrý" dokument oproti zjednodušeným seed datům — hodí se k ukázce,
kde RAG naráží na realitu:

- **Dlouhý výklad pojmů (čl. 44, 73 definic)** je ideální pro retrieval otázek
  typu „co znamená X" — embeddingy si s tím poradí dobře.
- **Hodnoty závislé na variantě (PRIMA/KOMFORT)** jsou klasická past: pokud
  chunk neobsahuje označení varianty, může chatbot vrátit limit z nesprávné
  varianty. Dobrý test pro ladění velikosti chunků a překryvu.
- **Otázka 21 (spoluúčast u skel)** je hezký okrajový případ — téma v dokumentu
  je, ale konkrétní číslo ne. Přesně tady se pozná, zda chatbot halucinuje.
