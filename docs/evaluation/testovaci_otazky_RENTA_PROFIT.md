# Testovací otázky – Životní pojištění RENTA PROFIT (O-959/25, Kooperativa)

Sada k ověření RAG chatbota nad dokumentem `A4_PP_zivotni_pojisteni_RENTA_PROFIT`
(pojistné podmínky O-959/25, platné od 25. 4. 2025). U každé otázky je očekávaná
odpověď a místo v dokumentu, ze kterého má chatbot čerpat.

**Struktura dokumentu:** na rozdíl od VPP M-100/M-200 není členěn na „články", ale na
části (VÍTEJTE V KOOPERATIVĚ · OBSAH POJIŠTĚNÍ · OBECNÁ USTANOVENÍ · VÝKLAD POJMŮ)
s číslovanými body. Citace proto odkazují na část + bod + odstavec.

**Charakter produktu:** RENTA PROFIT je **obnosové** životní pojištění pro případ
**smrti nebo dožití** (spořicí/rentový typ). Nekryje úraz, nemoc, invaliditu ani
hospitalizaci jako samostatná rizika — ta patří do FLEXI / skupinového pojištění.
Sekce C je proto cíleně na záměnu s produktem FLEXI.

---

## A. Faktické otázky V ROZSAHU (chatbot má odpovědět věcně + uvést zdroj)

**1. Co je pojistnou událostí v pojištění RENTA PROFIT?**
Očekáváno: smrt pojištěného, která nastane během trvání pojištění, nebo dožití se
konce pojištění pojištěným — podle toho, co nastane dříve.
Zdroj: Pojištění pro případ smrti nebo dožití, bod 1.

**2. Co dostanu, když se dožiju konce pojištění?**
Očekáváno: jednorázové pojistné plnění ve výši sjednané pojistné částky a podílu na
zisku připsaného během trvání pojištění. Místo jednorázové výplaty lze zvolit výplatu
důchodu na sjednanou dobu 5 nebo 10 let (podíl na zisku sjednaný důchod navýší).
Zdroj: Pojištění pro případ smrti nebo dožití, bod 3 (Při dožití).

**3. Za jakých podmínek mi můžete vyplatit plnění předčasně, ještě před koncem pojištění?**
Očekáváno: jen jste-li pojistníkem a současně pojištěným; pojištění muselo být
sjednáno nejméně do věku 60 let a alespoň na 120 kalendářních měsíců a zároveň buď
jste byl uznán invalidním ve třetím stupni, nebo jste dosáhl věku aspoň 60 let a
pojištění trvalo alespoň 120 kalendářních měsíců. Plnění se rovná kapitálové hodnotě
pojištění.
Zdroj: Pojištění pro případ smrti nebo dožití, bod 3 odst. 3.

**4. Kolik se vyplatí a komu, když pojištěný během trvání pojištění zemře?**
Očekáváno: pojistné plnění se rovná zaplacenému jednorázovému pojistnému a podílu na
zisku připsanému během trvání pojištění; právo na plnění má obmyšlený. Zemře-li
pojištěný během výplaty důchodu, pokračuje výplata obmyšlenému do konce sjednané doby.
Zdroj: Pojištění pro případ smrti nebo dožití, bod 3 odst. 4 a 5.

**5. Jak se u RENTA PROFIT platí pojistné?**
Očekáváno: jednorázovým pojistným za celou pojistnou dobu; zaplatit se musí nejpozději
první den trvání pojištění. Pojistné nelze platit v hotovosti.
Zdroj: Obecná ustanovení, bod 4 odst. 3 až 5.

**6. Co je odkupné a kdy na něj mám nárok?**
Očekáváno: při předčasném ukončení smlouvy má pojistník právo na odkupné, pokud bylo
zaplaceno jednorázové pojistné. Odkupné se rovná kapitálové hodnotě pojištění; není-li
tato hodnota kladná, odkupné se nevyplácí. Splatné je do 3 měsíců.
Zdroj: Obecná ustanovení, bod 6 (Co Vám vyplatíme při předčasném ukončení smlouvy).

**7. Za jak dlouho po skončení šetření vyplatíte pojistné plnění?**
Očekáváno: do 15 dnů po skončení šetření. Pokud šetření nelze ukončit do 3 měsíců od
obdržení oznámení pojistné události, pojišťovna to oprávněné osobě zdůvodní.
Zdroj: Obecná ustanovení, bod 7 odst. 6.

---

## B. Otázky MIMO znalostní bázi (test fallbacku „nevím")

Chatbot NESMÍ odpověď vymyslet.

**8. Kolik stojí pojištění RENTA PROFIT / jaká je sazba pojistného?**
Očekáváno: Fallback — dokument neuvádí konkrétní ceny ani sazby. Uvádí jen, že výše
pojistného se stanoví podle sjednané pojistné částky; konkrétní částka je věcí smlouvy.
Chatbot nesmí číslo vymyslet.

**9. Vyplatí mi RENTA PROFIT plnění, když utrpím úraz s trvalými následky?**
Očekáváno: Fallback / opatrná odpověď — RENTA PROFIT kryje pouze smrt nebo dožití,
úraz jako samostatné riziko těmito podmínkami krytý není. Chatbot má přiznat, že tento
produkt úrazové plnění neřeší (a nemá plést krytí z jiného produktu).

---

## C. Otázky na ZÁMĚNU s FLEXI (jen pokud jsou v bázi oba životní produkty)

Obě jsou životní pojištění Kooperativy, ale zásadně jiného typu — RENTA PROFIT je
spořicí (smrt/dožití), FLEXI je rizikové s řadou zdravotních připojištění a investiční
složkou. Otázky testují, zda chatbot nepřenese krytí z FLEXI na RENTA PROFIT.

**10. Kryje tento produkt vážná onemocnění (např. rakovinu nebo infarkt)?**
Očekáváno: Ne — vážná onemocnění jsou riziko životního pojištění FLEXI, ne RENTA
PROFIT. Správná reakce: RENTA PROFIT je pojištění pro případ smrti nebo dožití a
samostatné krytí vážných onemocnění neobsahuje. Chatbot by neměl převzít parametry z FLEXI.

**11. Můžu si v rámci tohoto pojištění zvolit investiční fondy nebo investiční strategii?**
Očekáváno: Ne — investiční složka (volba fondů) patří k FLEXI. RENTA PROFIT je obnosové
pojištění se sjednanou pojistnou částkou a podílem na zisku nad garantované zhodnocení,
nikoli fondové investiční pojištění.
Zdroj: str. 3 (obnosové pojištění) + Pojištění pro případ smrti nebo dožití, bod 5 (podíl na zisku).

**12. Nabízí tento produkt pojištění pracovní neschopnosti nebo pobytu v nemocnici?**
Očekáváno: Ne — pracovní neschopnost i hospitalizace jsou připojištění FLEXI / skupinového
pojištění, ne RENTA PROFIT. Ten kryje pouze smrt nebo dožití. Chatbot nemá číslo ani
krytí z jiného produktu vymýšlet.

---

## Poznámka pro kurz

RENTA PROFIT vs. FLEXI je životní analogie k dvojici M-100/M-200: oba jsou „životní
pojištění Kooperativy", ale pokrývají úplně jiná rizika. Sekce C ukazuje klasický RAG
problém — embeddingy najdou relevantní chunk o „životním pojištění", ale z nesprávného
produktu. Zobrazený zdroj u odpovědi a název produktu v metadatech chunku pomáhají
uživateli i modelu rozlišit, o který produkt jde.
