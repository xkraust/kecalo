# Testovací otázky – Cestovní pojištění M-750/23 (Kooperativa)

Sada k ověření RAG chatbota nad dokumentem `PP-M-750-18…_cestovni_pojisteni`
(předsmluvní informace a pojistné podmínky M-750/23, 63 stran). U každé otázky je
očekávaná odpověď a místo v dokumentu, ze kterého má chatbot čerpat.

**Struktura dokumentu:** části VÍTEJTE V KOOPERATIVĚ · PŘEDSMLUVNÍ INFORMACE ·
JEDNOTLIVÁ POJIŠTĚNÍ · OBECNÁ USTANOVENÍ · VÝKLAD POJMŮ. Nejvíc věcných otázek míří
do části **JEDNOTLIVÁ POJIŠTĚNÍ**, která obsahuje samostatné kapitoly pro jednotlivá
dílčí pojištění (léčebné výlohy, úrazové, zavazadla, zpoždění, odpovědnost, STORNO…).
Citace proto odkazují na kapitolu + číslovaný článek + odstavec.

**Pozor na limity:** většina konkrétních peněžních limitů je „stanovena v pojistné
smlouvě" — dokument je číselně neuvádí (kromě několika pevných částek: 3 000 Kč,
20 000 Kč, 250 000 Kč, 19 %, doby zpoždění, procenta storna). Chatbot nesmí částky,
které v podmínkách nejsou, vymýšlet.

---

## A. Faktické otázky V ROZSAHU (chatbot má odpovědět věcně + uvést zdroj)

**1. Co kryje pojištění léčebných výloh v zahraničí a jako jaký typ se sjednává?**
Očekáváno: sjednává se jako pojištění škodové; kryje náklady na neodkladné a nutné
ošetření v zahraničí v důsledku akutního onemocnění nebo úrazu vzniklého během cesty,
včetně repatriace zpět do ČR.
Zdroj: JEDNOTLIVÁ POJIŠTĚNÍ, Pojištění léčebných výloh v zahraničí, čl. 1.

**2. O jak dlouho lze prodloužit pojištění léčebných výloh, když se kvůli zdravotnímu stavu nemůžu vrátit do ČR?**
Očekáváno: se souhlasem pojišťovny / asistenční společnosti až do dne, kdy je návrat
možný, maximálně však o 6 týdnů.
Zdroj: Pojištění léčebných výloh v zahraničí, čl. 1 odst. 2.

**3. Do jaké částky můžu ošetření v zahraničí uhradit sám bez kontaktování asistenční společnosti?**
Očekáváno: náklady nepřevyšující 3 000 Kč lze uhradit bez kontaktu s asistenční
společností. Uhradíte-li bez jejího předchozího souhlasu náklady nad 3 000 Kč,
pojišťovna nemusí plnit.
Zdroj: Pojištění léčebných výloh v zahraničí, čl. 9 odst. 1 písm. e.

**4. Vztahuje se pojištění na rekreační lyžování na sjezdovce? A na závody?**
Očekáváno: rekreační provozování běžných sportů (mj. lyžování a snowboarding na
vyznačených sjezdovkách) je kryto vždy. Na závody a soutěže ani na rizikovější sporty
(aktivní / organizovaný / extrémní sport) se pojištění vztahuje jen tehdy, je-li
příslušný rozsah výslovně sjednán v pojistné smlouvě.
Zdroj: Pojištění léčebných výloh v zahraničí, čl. 2 (Pojištění sportovní činnosti).

**5. Kdy vzniká nárok na plnění za trvalé následky úrazu?**
Očekáváno: úraz musí nejpozději do 3 let zanechat trvalé následky; nárok vznikne jen
tehdy, dosáhne-li jejich celkové ohodnocení podle oceňovací tabulky alespoň 5 %.
Zdroj: Úrazové pojištění, čl. 2 odst. 1 a odst. 6.

**6. Kolik pojišťovna plní za úraz při dopravní nehodě?**
Očekáváno: pojistné plnění se stanoví ve výši dvojnásobku plnění za trvalé následky —
za podmínek, že jste byl ošetřen záchrannou službou na místě nebo do 24 hodin po
nehodě a nehoda byla neprodleně šetřena policií se záznamem o výsledku.
Zdroj: Úrazové pojištění, čl. 3.

**7. Za jak dlouhou hospitalizaci dostanu kompenzaci a jaká je maximální plněná doba?**
Očekáváno: pojistnou událostí je hospitalizace po dobu minimálně 3 dnů (2 noci);
pojistné plnění se poskytne maximálně za 15 dnů hospitalizace.
Zdroj: Úrazové pojištění, čl. 5 (Kompenzace pobytu v nemocnici).

**8. Jsou z pojištění zavazadel kryté peníze a cennosti?**
Očekáváno: Ne — pojištění se nevztahuje na peníze, ceniny, drahé kovy, perly a
drahokamy (kromě snubních prstenů), platební karty ani na drobné luxusní předměty,
jejichž hodnota přesahuje 20 000 Kč za jeden kus.
Zdroj: Pojištění zavazadel, čl. 3.

**9. Za jakých podmínek je kryté odcizení věcí z auta?**
Očekáváno: krádež z motorového vozidla je krytá jen tehdy, byly-li věci uloženy
v uzamčeném zavazadlovém prostoru, nebyly zvnějšku viditelné a pachatel prokazatelně
překonal překážku chránící věc před odcizením.
Zdroj: Pojištění zavazadel, čl. 2 odst. 2.

**10. Kdy mám nárok z pojištění zpoždění zavazadel a z pojištění zpoždění letu?**
Očekáváno: u zpoždění zavazadel při zpoždění řádně registrovaných zavazadel (odevzdaných
leteckému dopravci) nejméně o 6 hodin; u zpoždění letu při zpoždění odletu nejméně
o 6 hodin nebo při zrušení letu nejpozději 2 hodiny před odletem.
Zdroj: Pojištění zpoždění zavazadel, čl. 1 a Pojištění zpoždění letu, čl. 1.

**11. Kryje pojištění odpovědnosti škodu způsobenou psem?**
Očekáváno: Ano — újmu způsobenou zvířetem, které máte během cesty legálně u sebe,
pojištění kryje. ALE výlukou je pes při výkonu práva myslivosti nebo služební pes při
služebním výkonu; dále je vyloučena újma způsobená úmyslně nebo provozem motorového
vozidla.
Zdroj: Pojištění odpovědnosti, čl. 1 odst. 1 a čl. 5 odst. 1.

**12. Kolik pojišťovna proplatí při stornu zájezdu?**
Očekáváno: 100 % stornopoplatků, pokud se cesta ruší kvůli úmrtí pojištěného, úmrtí
blízké osoby méně než 30 dnů před odjezdem, nebo akutnímu onemocnění či úrazu
pojištěného vyžadujícímu hospitalizaci; z ostatních důvodů 80 % stornopoplatků (nejvýše
80 % ceny cestovních služeb doložené v pojistné smlouvě).
Zdroj: Pojištění STORNO, čl. 3 odst. 1.

**13. Kryje pojištění STORNO zrušení cesty kvůli karanténě?**
Očekáváno: Ano, pokud jde o preventivní karanténu nařízenou osobně pojištěnému
(rozhodnutím příslušného správního orgánu ČR nebo lékařem v ČR). Nevztahuje se na
plošně nařízenou karanténu (např. celý stát, kraj, obec, firma či škola).
Zdroj: Pojištění STORNO, čl. 1 písm. k.

---

## B. Otázky MIMO znalostní bázi (test fallbacku „nevím")

Chatbot NESMÍ odpověď vymyslet.

**14. Kolik stojí cestovní pojištění na týden do Chorvatska?**
Očekáváno: Fallback — dokument neuvádí ceny ani sazby pojistného; výše pojistného
je věcí konkrétní pojistné smlouvy. Chatbot nesmí částku vymyslet.

**15. Jaký je konkrétní limit léčebných výloh v korunách nebo eurech?**
Očekáváno: Fallback / opatrná odpověď — konkrétní částku limitu podmínky neuvádějí;
limit pojistného plnění je stanoven v pojistné smlouvě. Chatbot nemá žádné číslo vymyslet.

**16. Dostanu slevu na pojistném, když jsem loni neměl žádnou pojistnou událost (bonus za bezeškodní průběh)?**
Očekáváno: Fallback — žádný bonusový/slevový systém za bezeškodní průběh tyto podmínky
neuvádějí. Chatbot má přiznat, že informaci v dokumentu nenachází.

---

## C. Otázky na ROZLIŠENÍ dílčích pojištění a ZÁMĚNU produktu

Cestovní pojištění obsahuje mnoho podobných dílčích pojištění; navíc v bázi mohou být
i produkty na majetek (M-100/M-200). Tyto otázky testují, zda chatbot nezaměňuje
jednotlivá pojištění ani produkty.

**17. Jaký je rozdíl mezi pojištěním zavazadel a pojištěním zpoždění zavazadel?**
Očekáváno: pojištění zavazadel kryje poškození, zničení, ztrátu nebo odcizení věcí;
pojištění zpoždění zavazadel hradí náklady na nezbytné náhradní věci, když se řádně
registrovaná zavazadla zpozdí nejméně o 6 hodin. Jde o dvě různá dílčí pojištění.
Zdroj: Pojištění zavazadel, čl. 1 vs. Pojištění zpoždění zavazadel, čl. 1.

**18. Jaký je rozdíl mezi pojištěním STORNO a pojištěním přerušení cesty?**
Očekáváno: STORNO hradí stornopoplatky za zrušení cesty ještě před odjezdem; pojištění
přerušení cesty hradí náklady na náhradní dopravu zpět do ČR, když musíte přerušit už
probíhající zahraniční cestu (max. 250 000 Kč ze všech pojistných událostí).
Zdroj: Pojištění STORNO, čl. 1 vs. Pojištění přerušení cesty a nevyužité cestovní služby, čl. 2.

**19. Je pojištění léčebných výloh totéž co úrazové pojištění?**
Očekáváno: Ne — liší se i typem. Pojištění léčebných výloh je škodové (hradí skutečně
vynaložené náklady na ošetření v zahraničí), úrazové pojištění je obnosové (vyplácí
sjednanou pojistnou částku za trvalé následky nebo smrt úrazem podle oceňovací tabulky).
Zdroj: Pojištění léčebných výloh v zahraničí (škodové) vs. Úrazové pojištění (obnosové).

**20. Vztahuje se toto cestovní pojištění na škodu na mém bytě nebo bytovém domě v ČR?**
Očekáváno: Ne — pojištění nemovitosti a domácnosti v ČR řeší jiné produkty (VPP
M-100/M-200). Cestovní pojištění M-750 kryje rizika spojená se zahraniční cestou
(léčebné výlohy, úraz, zavazadla, odpovědnost na cestě apod.). Chatbot má rozlišit
produkt a nepřenášet krytí z pojištění majetku.

---

## Poznámka pro kurz

Cestovní pojištění je bohaté na podobně znějící dílčí pojištění (zavazadla vs. zpoždění
zavazadel, STORNO vs. přerušení cesty, léčebné výlohy vs. úrazové). Sekce C je dobrý
test, zda retrieval a model rozliší správnou kapitolu — a u otázky 20 správný produkt,
když je v bázi zároveň pojištění majetku. Většina peněžních limitů je v pojistné
smlouvě, ne v podmínkách; otázky 14–15 ověřují, že chatbot čísla nehalucinuje.
