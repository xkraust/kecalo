# Testovací otázky – Životní pojištění FLEXI (O-974/25, Kooperativa)

Sada k ověření RAG chatbota nad dokumentem `PP_ZP_Flexi` (pojistné podmínky O-974/25,
platné od 24. 10. 2025, 97 stran). U každé otázky je očekávaná odpověď a místo
v dokumentu, ze kterého má chatbot čerpat.

**Struktura dokumentu:** části JEDNOTLIVÁ POJIŠTĚNÍ · INVESTOVÁNÍ · OBECNÁ USTANOVENÍ ·
VÝKLAD POJMŮ. FLEXI je **komplexní** životní pojištění s mnoha samostatnými kapitolami
(smrt/dožití, invalidita, vážná onemocnění, pracovní neschopnost, hospitalizace,
úrazová připojištění, CESTA KE ZDRAVÍ, MAJÁK…) a investiční složkou. Citace odkazují na
kapitolu + číslovaný článek + odstavec.

**Charakter produktu:** FLEXI je převážně **obnosové** životní pojištění s investiční
složkou (kapitálová hodnota tvořená podílovými jednotkami fondů). Odlišuje se od
spořicího RENTA PROFIT (jen smrt/dožití) i od skupinového pojištění — sekce C je na tuto
záměnu.

---

## A. Faktické otázky V ROZSAHU (chatbot má odpovědět věcně + uvést zdroj)

**1. Jako jaký typ se FLEXI sjednává a má investiční složku?**
Očekáváno: většina pojištění ve FLEXI se sjednává jako obnosové (plnění ze sjednané
pojistné částky); pojištění CESTA KE ZDRAVÍ je škodové. Součástí je investiční složka —
kapitálová hodnota pojištění tvořená podílovými jednotkami fondů (část INVESTOVÁNÍ).
Zdroj: JEDNOTLIVÁ POJIŠTĚNÍ, úvod (str. 4) + část INVESTOVÁNÍ.

**2. Jaká je čekací doba u základního pojištění pro případ smrti?**
Očekáváno: 2 měsíce. Čekací doba se neuplatňuje, pokud hlavní pojištěný zemře výlučně
následkem úrazu.
Zdroj: Základní pojištění pro případ smrti nebo dožití, čl. 3.

**3. Kolik se vyplatí při smrti hlavního pojištěného?**
Očekáváno: pojistné plnění se rovná součtu pojistné částky pro případ smrti hlavního
pojištěného a kapitálové hodnoty pojištění; vyplácí se obmyšlenému.
Zdroj: Základní pojištění pro případ smrti nebo dožití, čl. 4 odst. 6.

**4. Co dostanu, když se dožiju konce pojištění?**
Očekáváno: jednorázové pojistné plnění ve výši kapitálové hodnoty pojištění ke dni
konce pojištění; na žádost lze plnění vyplácet formou důchodu (doživotního nebo na
sjednanou dobu). Jednorázově se vyplatí i tehdy, pokud by vypočtený měsíční důchod
nedosáhl alespoň 200 Kč.
Zdroj: Základní pojištění pro případ smrti nebo dožití, čl. 4 (Při dožití).

**5. V jakých variantách lze sjednat pojištění vážných onemocnění?**
Očekáváno: Základní varianta (11 vážných onemocnění), Kompletní varianta (65 vážných
onemocnění), varianta PRO NI (pro ženy) a varianta PRO NĚJ (pro muže).
Zdroj: Vážná onemocnění, čl. 1.

**6. Jaká je čekací doba u pojištění vážných onemocnění?**
Očekáváno: 2 měsíce. V případě pojistné události výlučně následkem úrazu se čekací doba
neuplatňuje.
Zdroj: Vážná onemocnění, čl. 4.

**7. V jakých variantách podle stupně invalidity lze pojištění sjednat a platí čekací doba?**
Očekáváno: varianty pro invaliditu III. stupně nebo sníženou soběstačnost, pro invaliditu
II. stupně a pro invaliditu I. stupně. Pro toto pojištění není stanovena žádná čekací doba.
Zdroj: Invalidita nebo snížená soběstačnost následkem úrazu nebo nemoci, čl. 1 a čl. 4.

**8. Co je podkladem pro nárok na plnění za invaliditu?**
Očekáváno: rozhodnutí příslušného orgánu státní správy, který pojištěného uznal
invalidním podle platného zákona o důchodovém pojištění (u snížené soběstačnosti pak
přiznání II. nebo vyššího stupně závislosti a příspěvku na péči).
Zdroj: Invalidita nebo snížená soběstačnost následkem úrazu nebo nemoci, čl. 2.

**9. Jaká je čekací doba u pracovní neschopnosti a mění se u komplikací s porodem?**
Očekáváno: základní čekací doba je 2 měsíce; u pracovní neschopnosti pro stavy a
komplikace v souvislosti s porodem se prodlužuje na 8 měsíců; u pracovní neschopnosti
výlučně následkem úrazu se neuplatňuje.
Zdroj: Pracovní neschopnost následkem úrazu nebo nemoci, čl. 4.

**10. Jak dlouho se plní pracovní neschopnost, když se neúčastním nemocenského pojištění?**
Očekáváno: pojistné plnění z jedné pojistné události maximálně za 548 dnů pracovní
neschopnosti.
Zdroj: Pracovní neschopnost následkem úrazu nebo nemoci, čl. 5 odst. 6.

**11. Kdy vznikne nárok u varianty pracovní neschopnosti „s plněním od 15. dne"?**
Očekáváno: pojistné plnění náleží pouze tehdy, trvá-li pracovní neschopnost déle než
14 dnů (u varianty s plněním od 29. dne pak déle než 28 dnů). Je-li kratší než počet dnů
uvedený ve variantě, plnění nenáleží.
Zdroj: Pracovní neschopnost následkem úrazu nebo nemoci, čl. 5.

**12. Za jak dlouhou hospitalizaci vzniká nárok a jak roste plnění s délkou pobytu?**
Očekáváno: hospitalizace musí trvat alespoň 2 dny (k propuštění dojde nejdříve
následující den po přijetí). Denní plnění se násobí koeficientem navýšení: prvních 30 dnů
1,0; 31.–90. den 1,5; od 91. dne 2,0. Maximální doba není omezena.
Zdroj: Pobyt v nemocnici (hospitalizace) následkem úrazu nebo nemoci, čl. 4.

**13. Jaká je čekací doba u pojištění pobytu v nemocnici (hospitalizace)?**
Očekáváno: 2 měsíce; u hospitalizace pro stavy a komplikace v souvislosti s porodem
8 měsíců. Neuplatňuje se u hospitalizace výlučně následkem úrazu nebo akutního
zánětlivého onemocnění.
Zdroj: Pobyt v nemocnici (hospitalizace) následkem úrazu nebo nemoci, čl. 3.

**14. Jaké plnění náleží při hospitalizaci nezletilého doprovázeného zletilou osobou?**
Očekáváno: pojistné plnění se stanoví z dvojnásobku pojistné částky platné k datu vzniku
pojistné události, a to za dobu pobytu doprovázející osoby v nemocnici.
Zdroj: Pobyt v nemocnici (hospitalizace) následkem úrazu nebo nemoci, čl. 4 odst. 6.

**15. Co se rozumí „sníženou soběstačností"?**
Očekáváno: dlouhodobě nepříznivý zdravotní stav, který trvá nebo má trvat déle než
1 rok a omezuje funkční schopnosti nutné pro zvládání základních životních potřeb, čímž
činí pojištěného závislým na pomoci jiné osoby; podkladem je přiznání II. nebo vyššího
stupně závislosti a příspěvku na péči.
Zdroj: Invalidita nebo snížená soběstačnost následkem úrazu nebo nemoci, čl. 2 odst. 3.

---

## B. Otázky MIMO znalostní bázi (test fallbacku „nevím")

Chatbot NESMÍ odpověď vymyslet.

**16. Kolik stojí životní pojištění FLEXI měsíčně?**
Očekáváno: Fallback — dokument neuvádí ceny ani sazby pojistného; výše je věcí konkrétní
pojistné smlouvy. Chatbot nesmí částku vymyslet.

**17. Kolik korun konkrétně dostanu za rakovinu ve variantě Kompletní?**
Očekáváno: Fallback / opatrná odpověď — plnění za vážné onemocnění se stanoví jako
procento z pojistné částky podle Seznamu vážných onemocnění; absolutní částku v korunách
podmínky neuvádějí (závisí na sjednané pojistné částce). Chatbot nemá číslo vymyslet.

**18. Kryje FLEXI škodu na mém automobilu po havárii?**
Očekáváno: Fallback / opatrná odpověď — FLEXI je pojištění osob (život, zdraví, úraz);
škodu na vozidle neřeší. Chatbot má přiznat, že tento produkt takové krytí neobsahuje.

---

## C. Otázky na ZÁMĚNU produktu (RENTA PROFIT, skupinové, majetek)

FLEXI, RENTA PROFIT i skupinové pojištění jsou „životní/úrazová" pojištění Kooperativy,
ale liší se konstrukcí. Otázky testují, zda chatbot nezamění produkt.

**19. Je FLEXI totéž co skupinové pojištění?**
Očekáváno: Ne — FLEXI je individuální životní pojištění (jedna hlavní pojištěná osoba,
investiční složka, široká nabídka připojištění). Skupinové pojištění se sjednává pro
skupinu pojištěných v rámci jedné smlouvy a řídí se vlastními podmínkami. Chatbot má
rozlišit produkt.

**20. Má FLEXI garantované zhodnocení a podíl na zisku jako RENTA PROFIT?**
Očekáváno: Ne v tomtéž smyslu — RENTA PROFIT je obnosové pojištění s garantovaným
zhodnocením a podílem na zisku, kdežto FLEXI má investiční složku (kapitálová hodnota
tvořená podílovými jednotkami fondů v části INVESTOVÁNÍ), jejíž hodnota kolísá podle
vývoje fondů. Jde o dva různé produkty.
Zdroj: FLEXI, část INVESTOVÁNÍ / kapitálová hodnota (vs. RENTA PROFIT, podíl na zisku).

**21. Zahrnuje toto pojištění pojištění majetku nebo odpovědnosti za škodu?**
Očekáváno: Ne — FLEXI je pojištění osob (život, zdraví, úraz). Pojištění majetku a
odpovědnosti řeší jiné produkty (VPP M-100/M-200). Chatbot nemá přenášet krytí
z pojištění majetku.

**22. Nabízí FLEXI i úrazová připojištění, jako jsou trvalé následky úrazu nebo denní odškodné?**
Očekáváno: Ano — FLEXI obsahuje řadu úrazových připojištění: smrt následkem úrazu,
trvalé následky úrazu, tělesné poškození úrazem (procentní plnění i denní odškodné),
úraz při dopravní nehodě aj. Tím se liší od RENTA PROFIT, který kryje jen smrt nebo dožití.
Zdroj: FLEXI, kapitoly úrazových připojištění (Smrt následkem úrazu, Trvalé následky úrazu,
Tělesné poškození způsobené úrazem, Úraz při dopravní nehodě).

---

## Poznámka pro kurz

FLEXI je nejobsáhlejší produkt v bázi — má desítky dílčích pojištění s vlastními čekacími
dobami a pravidly plnění. Sekce A ověřuje, že retrieval trefí správnou kapitolu (např. že
čekací doba u invalidity je nulová, ale u hospitalizace 2 měsíce). Sekce C testuje záměnu
tří „životních/úrazových" produktů (FLEXI × RENTA PROFIT × skupinové) — klasický RAG
problém podobných dokumentů, kde pomáhá název produktu v metadatech chunku.
