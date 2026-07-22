# Testovací otázky – Skupinové pojištění (O-985/26, Kooperativa)

Sada k ověření RAG chatbota nad dokumentem `PP_skupinove_pojisteni` (pojistné podmínky
O-985/26, platné od 30. 1. 2026, 62 stran). U každé otázky je očekávaná odpověď a místo
v dokumentu, ze kterého má chatbot čerpat.

**Struktura dokumentu:** části JEDNOTLIVÁ POJIŠTĚNÍ · OBECNÁ USTANOVENÍ · VÝKLAD POJMŮ.
Skupinové pojištění je **rizikové pojištění osob** (bez investiční/spořicí složky) —
v jedné pojistné smlouvě se pojišťuje více osob. Obsahuje řadu úrazových a nemocenských
připojištění (smrt, smrt následkem úrazu, tělesné poškození, trvalé následky, invalidita,
vážná onemocnění, hospitalizace, pracovní neschopnost). Citace odkazují na kapitolu +
číslovaný článek + odstavec.

**Charakter produktu:** blízké FLEXI z hlediska pokrytých rizik, ale jde o skupinový
produkt s odlišnými parametry (jiné čekací doby, jiné varianty). Sekce C je cíleně na
záměnu s FLEXI.

---

## A. Faktické otázky V ROZSAHU (chatbot má odpovědět věcně + uvést zdroj)

**1. Pro koho je skupinové pojištění určeno a jak se sjednává?**
Očekáváno: v jedné pojistné smlouvě se pojištění sjednává pro více osob. Pojistník musí
mít pojistný zájem — oprávněnou potřebu chránit osoby, na jejichž životě a zdraví má
zájem; tyto osoby musí se sjednáním pojištění souhlasit.
Zdroj: OBECNÁ USTANOVENÍ, bod 2 (Pojistný zájem) a bod 3 odst. 1.

**2. Jaká je čekací doba u pojištění pro případ smrti a platí výluka sebevraždy?**
Očekáváno: čekací doba je 2 měsíce (neuplatňuje se, zemře-li pojištěný výlučně následkem
úrazu). Plnění se neposkytne, zemře-li pojištěný v důsledku úmyslného sebepoškození,
sebevraždy nebo pokusu o ni do 2 let od počátku pojištění (resp. od zvýšení pojistné částky).
Zdroj: Pojištění pro případ smrti, bod 2 a bod 5.

**3. Je u pojištění smrti následkem úrazu čekací doba?**
Očekáváno: Ne — pro toto pojištění není stanovena žádná čekací doba. Pojistnou událostí je
úraz, který nejpozději do 3 let zapříčiní smrt pojištěného; plnění se vyplácí obmyšlenému
ve výši sjednané pojistné částky.
Zdroj: Smrt následkem úrazu, bod 1 a bod 2.

**4. V jakých variantách lze sjednat pojištění trvalých následků úrazu?**
Očekáváno: podle minimálního procenta hodnocení, od kterého vzniká nárok — s plněním od
0,1 % (pojistná ochrana pro jakékoli úrazy) nebo až od 10 %, resp. 25 % (pro závažnější
úrazy za nižší pojistné). Nedosáhne-li ohodnocení sjednaného minima, nárok na plnění nevzniká.
Zdroj: Trvalé následky úrazu, bod 1 odst. 2 a bod 3 odst. 7.

**5. Jaká je čekací doba u pojištění invalidity následkem úrazu nebo nemoci?**
Očekáváno: 18 měsíců, je-li pojištěný uznán invalidním pro invaliditu prvního stupně, a
12 měsíců pro invaliditu druhého nebo třetího stupně. Při vzniku invalidity výlučně
následkem úrazu se čekací doba neuplatňuje.
Zdroj: Invalidita následkem úrazu nebo nemoci, bod 2.

**6. Kolik se plní u invalidity třetího stupně se současně sníženou soběstačností?**
Očekáváno: pojistné plnění ve výši dvojnásobku aktuální pojistné částky (resp. důchodu).
Zdroj: Invalidita následkem úrazu nebo nemoci, bod 3 odst. 3.

**7. V jakých variantách lze sjednat pojištění vážných onemocnění?**
Očekáváno: ve variantách BASIC, STANDARD a EXCLUSIVE, každá zvlášť pro dospělé osoby i pro děti.
Zdroj: Vážná onemocnění, bod 1 odst. 1.

**8. Jaká je čekací doba u vážných onemocnění a platí podmínka přežití?**
Očekáváno: čekací doba je 2 měsíce (u pojistné události výlučně následkem úrazu se
neuplatňuje). Podmínkou plnění je, že pojištěný v důsledku vážného onemocnění nezemře do
30 dnů od potvrzení diagnózy nebo podstoupení operace.
Zdroj: Vážná onemocnění, bod 1 odst. 3 a bod 2.

**9. Kolik se plní za rakovinu vykazující rané maligní změny?**
Očekáváno: 30 % aktuální pojistné částky (pro jednoho pojištěného pouze jedenkrát během
trvání pojištění); za ostatní vážná onemocnění ze Seznamu 100 % podle sjednané varianty
(u některých jen částečné plnění).
Zdroj: Vážná onemocnění, bod 3 odst. 2.

**10. Za jak dlouhou hospitalizaci se plní a jaká je maximální doba?**
Očekáváno: denní plnění se násobí koeficientem navýšení podle délky pobytu — prvních 30 dnů
koeficient 1, 31.–90. den 1,5, od 91. dne 2. Maximální doba, za kterou se plní, je 1 000 dnů.
Zdroj: Pobyt v nemocnici následkem úrazu nebo nemoci, bod 3.

**11. Jaká je čekací doba u hospitalizace a mění se u zubů nebo porodu?**
Očekáváno: základní čekací doba je 2 měsíce; u hospitalizace kvůli ošetření zubů, zubním
náhradám či čelistní ortopedii/chirurgii se prodlužuje na 6 měsíců a u stavů a komplikací
v souvislosti s těhotenstvím a porodem na 8 měsíců. U hospitalizace výlučně následkem úrazu
se neuplatňuje.
Zdroj: Pobyt v nemocnici následkem úrazu nebo nemoci, bod 2.

---

## B. Otázky MIMO znalostní bázi (test fallbacku „nevím")

Chatbot NESMÍ odpověď vymyslet.

**12. Kolik stojí skupinové pojištění na jednoho zaměstnance?**
Očekáváno: Fallback — dokument neuvádí ceny ani sazby pojistného; výše je věcí konkrétní
pojistné smlouvy. Chatbot nesmí částku vymyslet.

**13. Kryje skupinové pojištění škodu na majetku firmy nebo odpovědnost zaměstnavatele?**
Očekáváno: Fallback / opatrná odpověď — skupinové pojištění je pojištění osob (život, úraz,
nemoc pojištěných). Pojištění majetku firmy ani odpovědnosti zaměstnavatele neřeší; chatbot
má přiznat, že takové krytí v dokumentu není.

---

## C. Otázky na ZÁMĚNU s FLEXI (jen pokud jsou v bázi oba produkty)

Skupinové pojištění a FLEXI pokrývají velmi podobná rizika (smrt, úraz, invalidita, vážná
onemocnění, hospitalizace), ale mají odlišné parametry. Tyto otázky testují, zda chatbot
nezamění produkt a nepřenese hodnoty z jednoho do druhého.

**14. Má skupinové pojištění investiční nebo spořicí složku jako FLEXI?**
Očekáváno: Ne — skupinové pojištění je čistě rizikové pojištění osob (smrt, úraz, nemoc);
nemá investiční složku ani kapitálovou hodnotu tvořenou fondy jako FLEXI. Chatbot má rozlišit
produkt a nepřipisovat skupinovému investiční část z FLEXI.

**15. Je čekací doba u invalidity ve skupinovém pojištění stejná jako ve FLEXI?**
Očekáváno: Ne — ve FLEXI není u pojištění invalidity stanovena žádná čekací doba, kdežto ve
skupinovém pojištění je 18 měsíců (invalidita I. stupně) nebo 12 měsíců (II./III. stupeň).
Chatbot nemá zaměnit parametr mezi produkty.
Zdroj: Skupinové – Invalidita následkem úrazu nebo nemoci, bod 2 vs. FLEXI – Invalidita, bod 4.

**16. Jsou varianty vážných onemocnění stejné jako ve FLEXI?**
Očekáváno: Ne — skupinové pojištění používá varianty BASIC / STANDARD / EXCLUSIVE (pro
dospělé i pro děti), zatímco FLEXI má varianty Základní (11 onemocnění) / Kompletní (65) /
PRO NI / PRO NĚJ. Chatbot nemá plést pojmenování variant mezi produkty.
Zdroj: Skupinové – Vážná onemocnění, bod 1 vs. FLEXI – Vážná onemocnění, bod 1.

---

## Poznámka pro kurz

Skupinové pojištění je nejtěsnější „dvojče" FLEXI — pokrývá skoro stejná rizika, ale s jinými
čekacími dobami (invalidita 18/12 měsíců vs. 0 ve FLEXI), jinými variantami vážných onemocnění
(BASIC/STANDARD/EXCLUSIVE vs. Základní/Kompletní) a bez investiční složky. Sekce C je proto
nejcennější ukázka RAG záměny podobných produktů: model musí odpovědět z toho správného a
podpořit to zobrazeným zdrojem a názvem produktu v metadatech chunku.
