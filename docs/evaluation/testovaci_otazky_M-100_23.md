# Testovací otázky – VPP M-100/23 (pojištění majetku a odpovědnosti občanů, Kooperativa)

Sada k ověření RAG chatbota nad dokumentem `VPP M-100_23`. U každé otázky je
očekávaná odpověď a článek, ze kterého má chatbot čerpat.

**Důležité pro kurz:** tento dokument je od stejné pojišťovny jako M-200/23
(bytové domy) a sdílí s ním velkou část textu (společná ustanovení, výklad
pojmů, definice). Pokud máte v bázi oba dokumenty zároveň, je to výborný test
toho, zda retrieval vrátí správný zdroj a zda chatbot neplete limity z jiného
produktu. Otázky v sekci F jsou cíleně na tuto záměnu.

---

## A. Faktické otázky V ROZSAHU (přesná hodnota / pravidlo)

**1. Co je „ekologický benefit" a za jakých podmínek se vyplácí?**
Očekáváno: nad rámec pojistné částky uhradí náklady na ekologickou modernizaci
(zateplení, fotovoltaika, jímání dešťové vody); podmínky: plnění přesáhne 75 %
pojistné částky a objekt nebyl podpojištěn; limit 5 % z pojistné částky objektu.
Zdroj: čl. 29 odst. 8.

**2. Jak staré může být zařízení u připojištění prodloužené záruky spotřebičů?**
Očekáváno: spotřebič nesmí být starší 6 let od data zakoupení jako nový.
Zdroj: čl. 31 odst. 3 písm. b.

**3. Které spotřebiče spadají do připojištění prodloužené záruky?**
Očekáváno: chladnička/mraznička, pračka/sušička, myčka, sporák/varná deska/trouba
(kromě samostatných mikrovlnek), digestoř, průtokový ohřívač/bojler/kotel, televizor.
Zdroj: čl. 31 odst. 2.

**4. Jaký je limit plnění za pojistnou událost na garáži (připojištění garáže)?**
Očekáváno: 400 000 Kč.
Zdroj: čl. 32 odst. 5.

**5. Jaký je sublimit na pronajaté movité věci a spoluúčast z havarijního pojištění?**
Očekáváno: 30 000 Kč za pojistný rok v rámci sjednaného limitu.
Zdroj: čl. 43 odst. 3.

**6. Jaké tři typy pojistné hodnoty dokument rozlišuje?**
Očekáváno: nová cena, časová cena, obvyklá cena.
Zdroj: čl. 26 odst. 2.

**7. Do kdy je splatné pojistné plnění po skončení šetření?**
Očekáváno: do 15 dnů od skončení šetření.
Zdroj: čl. 12 odst. 3.

**8. Jaká rychlost větru se považuje za vichřici?**
Očekáváno: 20,8 m/s a vyšší.
Zdroj: čl. 44 odst. 56.

---

## B. Otázky na ODPOVĚDNOST (část 4) a její územní rozsah

**9. Na jakém území platí pojištění odpovědnosti v běžném občanském životě?**
Očekáváno: na celém světě.
Zdroj: čl. 37 odst. 7.

**10. Na jakém území platí pojištění odpovědnosti z vlastnictví nemovitosti?**
Očekáváno: pouze na území České republiky.
Zdroj: čl. 38 odst. 5.

(Otázky 9 a 10 jsou skvělá dvojice — stejný dokument, dva různé územní rozsahy
podle typu odpovědnosti. Dobrý test, zda chatbot nevrátí špatnou z těchto dvou.)

**11. Vztahuje se pojištění odpovědnosti na škodu způsobenou psem?**
Očekáváno: Ano u běžného občanského života (zvíře pod dohledem), ALE ne, pokud
pes škodil při výkonu práva myslivosti nebo služebním výkonu (výluka).
Zdroj: čl. 37 odst. 2 písm. d a čl. 39 odst. 2 písm. g.

**12. Je z pojištění odpovědnosti kryta škoda při profesionální sportovní činnosti?**
Očekáváno: Ne — je vyloučena. Pozn.: za profesionální se nepovažuje sport,
kde roční příjmy nepřesáhly 150 000 Kč.
Zdroj: čl. 39 odst. 2 písm. a a čl. 44 odst. 35 (definice).

**13. Jaký je roční souhrnný limit u pojištění odpovědnosti?**
Očekáváno: maximálně dvojnásobek limitu plnění sjednaného ve smlouvě.
Zdroj: čl. 43 odst. 2.

---

## C. Majetek – krytá nebezpečí a odcizení

**14. Je krádež automaticky kryta v základním pojištění majetku?**
Očekáváno: Ne — odcizení (krádež s překonáním překážky, loupež) se hradí jen,
je-li to výslovně ujednáno. Základ pokrývá živelní nebezpečí.
Zdroj: čl. 23 odst. 1 vs. odst. 3.

**15. Jak je to s vandalismem u pojištění domácnosti?**
Očekáváno: U domácnosti/rekreační domácnosti se vandalismus vztahuje jen na
případy, kdy pachatel překonal překážku zabraňující vstupu (s výjimkou škody
na vstupních dveřích do bytu).
Zdroj: čl. 23 odst. 7.

---

## D. Definice / rozlišení pojmů

**16. Jaký je rozdíl mezi povodní a záplavou?**
Očekáváno: Povodeň = přechodné zvýšení hladiny toku, voda zaplavuje mimo koryto;
záplava = vytvoření souvislé vodní plochy stojící/proudící v místě pojištění.
Zdroj: čl. 44 odst. 31 a 62.

**17. Co se rozumí motorovým vozidlem podle těchto podmínek?**
Očekáváno: nekolejové vozidlo poháněné vlastním motorem včetně pracovních strojů
(zahradní traktůrek), elektrovozidel, segwayů — bez ohledu na registrační značku.
Zdroj: čl. 44 odst. 11.

---

## E. Otázky MIMO znalostní bázi (test fallbacku „nevím")

Chatbot NESMÍ odpověď vymyslet.

**18. Kolik stojí pojištění domácnosti pro byt 3+1?**
Očekáváno: Fallback — dokument neuvádí ceny ani sazby pojistného.

**19. Pojišťuje tento produkt léčebné výlohy na dovolené v zahraničí?**
Očekáváno: Fallback — jde o cestovní pojištění, které tento dokument neřeší
(týká se majetku a odpovědnosti občanů).

**20. Jaká je přesná spoluúčast u pojištění skla a sanity?**
Očekáváno: Fallback / opatrná odpověď — čl. 24 konkrétní spoluúčast neuvádí
(plnění se řídí limitem a smlouvou). Chatbot by neměl číslo vymyslet.

---

## F. Otázky na ZÁMĚNU mezi M-100 a M-200 (jen pokud máte v bázi oba dokumenty)

Tyto otázky mají smysl, pokud jsou naindexované M-100 i M-200 současně. Testují,
zda chatbot vrátí správný zdroj a neplete produkty.

**21. Jaký je limit na náhradní ubytování?**
Pozor: tento údaj (25 000 / 250 000 Kč, varianta KOMFORT) je v dokumentu M-200
(bytové domy), NE v M-100. Pokud se zeptáte v kontextu M-100, správná reakce je,
že M-100 tento konkrétní limit neobsahuje — chatbot by neměl převzít číslo z M-200.

**22. Jaký je limit plnění na garáž?**
Naopak připojištění garáže (400 000 Kč) je v M-100 (čl. 32), ne v M-200.
Chatbot má vrátit M-100 jako zdroj.

**23. Existují u tohoto produktu varianty PRIMA a KOMFORT?**
Pozor: varianty PRIMA/KOMFORT pro pojištění věci jsou výrazně rozpracované
v M-200. V M-100 se PRIMA/KOMFORT objevuje jen okrajově u připojištění
(garáž = PRIMA, rostliny = KOMFORT). Dobrý test, zda chatbot nepřenese strukturu
variant z M-200.

---

## Poznámka pro kurz

Dvojice dokumentů M-100 + M-200 je ideální demonstrace problému, který v RAGu
vzniká u podobných dokumentů: embeddingy najdou relevantní chunk, ale ten může
pocházet z nesprávného produktu, protože text je skoro totožný. Řešení, která
můžete účastníkům ukázat:

- zobrazování zdroje u odpovědi (uživatel vidí, ze kterého dokumentu plyne),
- metadata chunků (název produktu) a jejich uvedení do promptu,
- v admin panelu „Test retrievalu" porovnání skóre chunků z obou dokumentů.

Otázky 20 a F (21–23) jsou nejcennější pro ukázku halucinací a záměny zdroje.
