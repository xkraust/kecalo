# Testovací otázky pro RAG chatbota – Pojišťovna Jistota

Sada slouží k ověření funkčnosti chatbota po naindexování tří seed dokumentů
(cestovní, havarijní, domácnost). U každé otázky je uvedena očekávaná odpověď
a zdroj, ze kterého má chatbot čerpat — díky tomu poznáte, zda retrieval našel
správný dokument a zda odpověď nehalucinuje.

---

## A. Otázky V ROZSAHU znalostní báze (chatbot má odpovědět věcně + uvést zdroj)

**1. Jaký je limit léčebných výloh u varianty Komfort cestovního pojištění?**
Očekáváno: 7 000 000 Kč.
Zdroj: 01_cestovni_pojisteni.pdf, čl. 2.

**2. Kryje cestovní pojištění zrušení letu ze strany dopravce?**
Očekáváno: Ne — připojištění storna se nevztahuje na zrušení letu dopravcem.
Zdroj: 01_cestovni_pojisteni.pdf, čl. 3.

**3. Jsou děti pojištěny automaticky a za jakých podmínek?**
Očekáváno: Ano, děti do 15 let cestující s rodičem jsou pojištěny bez navýšení
pojistného ve stejném rozsahu; limity se nesnižují.
Zdroj: 01_cestovni_pojisteni.pdf, čl. 5.

**4. Jaká je spoluúčast u varianty Standard havarijního pojištění?**
Očekáváno: 5 % z výše škody, minimálně 5 000 Kč.
Zdroj: 02_havarijni_pojisteni.pdf, bod 2 a 3.

**5. Kolik pojišťovna vyplatí při škodě 40 000 Kč na variantě Standard?**
Očekáváno: 35 000 Kč (spoluúčast 5 000 Kč – uplatní se minimum).
Zdroj: 02_havarijni_pojisteni.pdf, bod 3.

**6. Platí havarijní pojištění AutoJistota na Ukrajině?**
Očekáváno: Ne — neplatí v Rusku, Bělorusku a na Ukrajině.
Zdroj: 02_havarijni_pojisteni.pdf, bod 4.

**7. Jaký bonus lze získat za bezeškodní průběh u havarijního pojištění?**
Očekáváno: 5 % ročně, max. 50 %.
Zdroj: 02_havarijni_pojisteni.pdf, bod 6.

**8. Jaká je spoluúčast u pojištění domácnosti?**
Očekáváno: 1 000 Kč na událost; u připojištění povodně 5 %, min. 10 000 Kč.
Zdroj: 03_pojisteni_domacnosti_faq.pdf.

**9. Vztahuje se pojištění domácnosti na povodeň?**
Očekáváno: Jen pokud je sjednáno připojištění povodně/záplavy; standardně ne.
Zdroj: 03_pojisteni_domacnosti_faq.pdf.

**10. Do kdy musím nahlásit pojistnou událost u domácnosti?**
Očekáváno: Bez zbytečného odkladu, nejpozději do 15 dnů.
Zdroj: 03_pojisteni_domacnosti_faq.pdf.

**11. Jaký je sublimit na elektroniku u pojištění domácnosti?**
Očekáváno: 30 % z pojistné částky.
Zdroj: 03_pojisteni_domacnosti_faq.pdf.

**12. Na jaké asistenční lince nahlásím škodu na vozidle?**
Očekáváno: +420 222 333 555.
Zdroj: 02_havarijni_pojisteni.pdf, bod 5.

---

## B. Otázky MIMO znalostní bázi (chatbot má odpovědět „nevím" / odkázat na infolinku)

Tyto otázky testují fallback. Chatbot NESMÍ odpověď vymyslet — má přiznat,
že informace v dokumentech není.

**13. Nabízíte životní pojištění a jaké má krytí?**
Očekáváno: Fallback — životní pojištění není v žádném z nahraných dokumentů.
Chatbot odkáže na infolinku, neměl by si vymýšlet.

**14. Jaká je spoluúčast u cestovního pojištění pro připojištění potápění
nad 30 metrů v Thajsku?**
Očekáváno: Fallback — konkrétní číslo v dokumentech není (zmiňuje se jen
nutnost zvláštního připojištění rizikových sportů, ne jeho spoluúčast).
Chatbot by neměl číslo vymyslet.

---

## Doporučený demo scénář pro kurz

1. Před indexací: položit otázku 1 → chatbot nemá data → fallback.
2. Nahrát všechny tři PDF, počkat na dokončení indexace.
3. Položit otázku 1 → správná odpověď se zdrojem (cestovní pojištění).
4. Položit navazující otázku „A co u varianty Maximum?" → test kontextu konverzace.
5. Položit otázku 13 → fallback „nevím" (test, že bot nehalucinuje).
6. Smazat dokument 01_cestovni_pojisteni.pdf.
7. Znovu položit otázku 1 → fallback (ověření, že smazaný dokument zmizel z báze).
