# Demo scénář – závěrečná prezentace RAG chatbota

Režijní plán pro předvedení hotové aplikace na konci kurzu. Postupuje od
nejjednoduššího případu k nejnáročnějšímu (záměna zdrojů u podobných dokumentů).
Každý krok má: **co zadat**, **co se má stát** a **co tím ukazuji**.

Odhadovaná délka: **12–15 minut** čistého času na demo.

Materiály (vše už připravené):
- Seed data – fiktivní pojišťovna Jistota: `01_cestovni_pojisteni.pdf`,
  `02_havarijni_pojisteni.pdf`, `03_pojisteni_domacnosti_faq.pdf`
- Reálné dokumenty Kooperativa: `VPP_M-100_23` (majetek a odpovědnost),
  `VPP_M-200_23` (bytové domy)
- Sady otázek: `testovaci_otazky.md`, `testovaci_otazky_M-100.md`,
  `testovaci_otazky_M-200.md`

> Tip: před demem mít bázi **prázdnou** (nebo jen s jedním dokumentem), ať je
> vidět celý tok od nahrání. Mít dokumenty po ruce v jedné složce.

---

## Blok 0 – Příprava (před publikem, ~1 min)

- Otevřít aplikaci (chat + admin ve dvou záložkách).
- Ukázat prázdnou znalostní bázi v adminu.
- Jedna věta o architektuře: „Bot odpovídá jen z dokumentů, které sem nahraju,
  a u každé odpovědi řekne zdroj."

---

## Blok 1 – Rozjezd na čistých datech (~2 min)

**Krok 1.1 – Otázka na prázdnou bázi**
- Zadat: *„Jaký je limit léčebných výloh u cestovního pojištění?"*
- Co se stane: fallback „nevím / nemám dokumenty".
- Co ukazuji: bot si nevymýšlí, i když ještě nic neumí.

**Krok 1.2 – Nahrání prvního dokumentu**
- V adminu nahrát `01_cestovni_pojisteni.pdf`.
- Co se stane: stav `Zpracovává se → Hotovo`, naskočí počet chunků.
- Co ukazuji: indexace v reálném čase (extrakce → chunking → embeddingy).

**Krok 1.3 – Stejná otázka znovu**
- Zadat: *„Jaký je limit léčebných výloh u varianty Komfort?"*
- Co se stane: správná odpověď „7 000 000 Kč" + zdroj (cestovní pojištění, čl. 2).
- Co ukazuji: celá RAG smyčka funguje, odpověď má citaci zdroje.

---

## Blok 2 – Kontext konverzace (~1,5 min)

**Krok 2.1 – Navazující dotaz**
- Zadat: *„A co u varianty Maximum?"*
- Co se stane: bot pochopí, že jde pořád o léčebné výlohy → „neomezeně".
- Co ukazuji: drží kontext konverzace, navazující otázka bez zopakování tématu.

**Krok 2.2 – Nová konverzace (volitelné)**
- Kliknout „Nová konverzace", zadat *„A co u varianty Maximum?"* znovu.
- Co se stane: bot už neví, čeho se to týká (kontext byl vymazán).
- Co ukazuji: rozdíl mezi navazujícím dotazem a čistým startem.

---

## Blok 3 – Fallback / žádné halucinace (~1,5 min)

**Krok 3.1 – Otázka mimo bázi**
- Zadat: *„Nabízíte životní pojištění a jaké má krytí?"*
- Co se stane: fallback „v dokumentech to není, kontaktujte infolinku".
- Co ukazuji: bot nehalucinuje, i když zní otázka legitimně.

**Krok 3.2 – Záludná otázka (téma je, číslo ne)**
- Zadat: *„Jaká je spoluúčast u připojištění potápění?"*
- Co se stane: bot uvede, že rizikové sporty vyžadují připojištění, ale konkrétní
  spoluúčast v podmínkách není → nevymyslí číslo.
- Co ukazuji: rozdíl mezi „nevím vůbec" a „téma znám, ale přesný údaj chybí".

---

## Blok 4 – Správa znalostní báze (~1,5 min)

**Krok 4.1 – Smazání dokumentu**
- V adminu smazat `01_cestovni_pojisteni.pdf` (potvrdit dialog).
- Co se stane: dokument i jeho chunky zmizí z báze.
- Co ukazuji: admin má plnou kontrolu nad tím, z čeho bot čerpá.

**Krok 4.2 – Ověření**
- Zadat: *„Jaký je limit léčebných výloh u varianty Komfort?"*
- Co se stane: zpět na fallback – bot už ze smazaného dokumentu neodpovídá.
- Co ukazuji: smazání je skutečné, ne jen skrytí.

---

## Blok 5 – Přechod na reálná data (~2 min)

**Krok 5.1 – Nahrání ostrého dokumentu**
- V adminu nahrát `VPP_M-200_23` (bytové domy, 19 stran).
- Co se stane: delší indexace, výrazně víc chunků než u seed dat.
- Co ukazuji: zvládá i reálné, dlouhé a právně psané podmínky.

**Krok 5.2 – Přesná faktická otázka**
- Zadat: *„Jaký je roční limit plnění pro pojištění elektromotorů?"*
- Co se stane: „50 000 Kč, spoluúčast 10 %" + zdroj (čl. 29 odst. 10).
- Co ukazuji: retrieval najde konkrétní číslo i v dlouhém dokumentu.

**Krok 5.3 – Otázka závislá na variantě**
- Zadat: *„Kryje varianta PRIMA krádež vloupáním?"*
- Co se stane: bot rozliší, že krádež je až ve variantě KOMFORT.
- Co ukazuji: zvládá rozlišení variant – častý oříšek pro RAG.

---

## Blok 6 – Vrchol: záměna zdrojů u podobných dokumentů (~2,5 min)

**Krok 6.1 – Nahrát druhý, podobný dokument**
- V adminu nahrát `VPP_M-100_23` (majetek a odpovědnost). Teď jsou v bázi
  oba dokumenty Kooperativy, které sdílejí velkou část textu.
- Co ukazuji: realistická situace – víc podobných produktů v jedné bázi.

**Krok 6.2 – Otázka specifická pro jeden produkt**
- Zadat: *„Jaký je limit plnění na garáž?"*
- Co se stane: odpověď „400 000 Kč" se zdrojem **M-100** (čl. 32) – ne M-200.
- Co ukazuji: retrieval trefil správný produkt; zobrazení zdroje to dokládá.

**Krok 6.3 – Otázka, kde hrozí záměna**
- Zadat: *„Jaký je limit na náhradní ubytování?"*
- Co se stane: odpověď by měla mířit do M-200 (25 000 / 250 000 Kč), protože
  v M-100 tento údaj není.
- Co ukazuji: hodnota metadat a zdroje – uživatel i bot vědí, z kterého
  produktu odpověď plyne. Pokud by retrieval sáhl vedle, je to vidět a je to
  ideální moment vysvětlit ladění (chunky, metadata produktu, práh).

**Krok 6.4 – (Volitelné, pro technické publikum) Test retrievalu v adminu**
- V admin panelu „Test retrievalu" zadat stejnou otázku a ukázat top-k chunky
  se skóre z obou dokumentů.
- Co ukazuji: „pod kapotou" RAGu – jak se vybírají pasáže a jak blízko si byly
  konkurenční chunky z obou produktů.

---

## Závěrečné shrnutí (~1 min)

Jednou větou propojit, co publikum vidělo:
> „Nahrál jsem dokumenty, bot z nich odpovídá s uvedením zdroje, drží kontext,
> přizná, když něco neví, a umím bázi spravovat. U podobných produktů se ukázalo,
> proč je důležité zobrazovat zdroj a ladit retrieval."

Pak prostor na otázky.

---

## Záložní plán (kdyby něco selhalo na živo)

- **API neodpovídá / pomalé:** mít připravený screenshot/nahrávku jedné úspěšné
  odpovědi; pokračovat výkladem nad ní.
- **Indexace dlouho trvá:** nahrát dokument už během bloku 0, ať je do bloku 5
  hotový; nebo použít menší seed PDF místo plného M-200.
- **Špatná odpověď u bloku 6:** nevadí – je to autentická ukázka limitu RAGu;
  otevřít „Test retrievalu" a vysvětlit, čím by se to ladilo (větší/menší chunky,
  produkt v metadatech, vyšší práh). Z chyby udělat výukový moment.
- **Mít po každém milníku commit** (viz harmonogram v PRD), aby šlo v nouzi
  spustit poslední funkční verzi.
