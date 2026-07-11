# Langfuse datasety — testovací otázky

CSV exporty testovacích otázek z `docs/testovaci_otazky*.md` připravené pro import do
**Langfuse › Datasets**. Slouží k systematickému hodnocení RAG chatbota (regrese při
ladění chunkování, prahů, promptu).

## Soubory

| CSV | Zdroj | Řádků | Obsah |
|---|---|---|---|
| `dataset_obecne.csv` | `testovaci_otazky.md` | 12 | průřezové otázky napříč bází + fallback |
| `dataset_M-100_23.csv` | `testovaci_otazky_M-100_23.md` | 23 | pojištění majetku a odpovědnosti občanů |
| `dataset_M-200_23.csv` | `testovaci_otazky_M-200_23.md` | 21 | pojištění bytových domů |

## Struktura sloupců

Kódování UTF-8, oddělovač čárka, textová pole v uvozovkách (RFC 4180).

| Sloupec | Mapování v Langfuse | Popis |
|---|---|---|
| `input` | **Input** | dotaz uživatele (to, co jde do chatu) |
| `expected_output` | **Expected output** | očekávaná věcná odpověď (ground truth) |
| `category` | Metadata | `in_scope` / `out_of_scope` (fallback) / `confusion` (záměna M-100 ↔ M-200) |
| `document` | Metadata | dokument, ze kterého má retrieval čerpat (prázdné u fallbacku) |
| `expected_source` | Metadata | očekávaná citace (článek/odstavec) — kontrola, zda míří na správný zdroj |
| `expects_offer` | Metadata | `true` = produktový dotaz, odpověď MÁ nést token `[[NABIDKA]]`; `false` = fallback/administrativní dotaz, token NESMÍ; prázdné = šedá zóna (definiční/confusion otázky) — skóre `offer_correct` se nepočítá |

`category` umožňuje v Langfuse filtrovat běhy: u `in_scope` hodnotíme věcnou správnost
a citaci, u `out_of_scope` naopak očekáváme fallback (chatbot NESMÍ halucinovat číslo).

## Sync metadat do Langfuse (bez re-importu)

Změny metadat (např. `expects_offer`) se do existujících Langfuse items promítají skriptem:

```bash
node scripts/langfuse-sync-metadata.mjs          # všechny 3 datasety
node scripts/langfuse-sync-metadata.mjs --dry    # jen výpis, bez zápisu
```

Skript páruje CSV řádky s items podle `input` (exact match; při nespárování skončí chybou)
a provede upsert podle `id` — **datasety se nesmí vytvářet znovu** (na jejich `datasetId`
je navázaný filtr LLM-as-judge pravidla „Correctness in Czech") a re-import CSV přes UI
by založil duplicitní položky. Pozn.: upsert obnovuje `createdAt` položky, takže mění
pořadí items v UI/`--limit` výběru.

## Import do Langfuse

1. **Vytvoř dataset:** Langfuse dashboard → projekt Kecalo → **Datasets** → *New dataset*
   (např. `kecalo-obecne`, `kecalo-M-100`, `kecalo-M-200`).
2. **Nahraj CSV:** v detailu datasetu **Add items → Upload CSV** → vyber soubor.
3. **Namapuj sloupce:** `input` → *Input*, `expected_output` → *Expected output*, zbývající
   tři (`category`, `document`, `expected_source`) → *Metadata*. Potvrď import.

## Použití — spuštění evaluace

Langfuse dataset se „prožene" aplikací a výstupy se porovnají s `expected_output`.
Dvě varianty podle náročnosti:

**A) Ruční / demo (bez kódu).** V UI otevři dataset item, zkopíruj `input` do chatu
Kecala, porovnej odpověď a citaci s `expected_output` / `expected_source`. Rychlé pro kurz.

**B) Skriptovaný běh (Dataset Run).** Malý Node/TS skript projede items, pro každý zavolá
`POST /api/chat`, zaznamená výstup jako *dataset run item* a napojí na trace (SDK
`langfuse.getDataset(...)` + `item.link(trace, runName)`). Nad výsledky se pak pustí
evaluátory:
- **in_scope** — LLM-as-judge (faithfulness/correctness proti `expected_output`) + kontrola,
  že odpověď obsahuje `expected_source`.
- **out_of_scope** — kontrola, že odpověď je fallback (žádné vymyšlené číslo); lze skórovat
  přítomností fallback formulace / infolinky.

> Pozn.: retrieval už posílá zdroje v hlavičce `X-Sources` (viz `chat/route.ts`), takže
> kontrola `expected_source` jde dělat i bez LLM-judge — porovnáním s `filename`/`section`.

## Aktualizace

CSV jsou ručně synchronizované s `docs/testovaci_otazky*.md`. Při změně otázek uprav
odpovídající řádek a znovu nahraj (Langfuse verzuje items — re-upload založí novou verzi).
