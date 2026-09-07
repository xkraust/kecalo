#!/usr/bin/env node
/**
 * Ověření, že se identita reálného pojistitele nedostala do znalostní báze.
 *
 * Zdrojová PDF v `docs/seed-docs/` jsou skutečné pojistné podmínky, zatímco
 * aplikace o sobě tvrdí, že běží „na datech fiktivní pojišťovny". Redakci
 * dělá `src/lib/rag/redact.ts` při indexaci; tenhle skript kontroluje VÝSLEDEK
 * v databázi — obsah chunků, cesty sekcí (jdou přes X-Sources do UI) i názvy
 * dokumentů.
 *
 * ZÁMĚRNĚ neobsahuje redakční logiku, jen hledá. Kdyby pravidla existovala
 * dvakrát (TS modul + tenhle skript), rozejdou se a skript by mlčel právě
 * tehdy, když by měl křičet.
 *
 * Exit kód 1 při jakémkoli nálezu — dá se použít jako brána před nasazením.
 *
 * Použití:
 *   node scripts/scan-brand-leaks.mjs            # souhrn podle dokumentů
 *   node scripts/scan-brand-leaks.mjs --verbose  # + ukázky kontextu
 *
 * Env (z .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY (.env.local)."
  );
  process.exit(2);
}
const sb = createClient(url, key);

/**
 * Zakázané vzory. Každý sám o sobě identifikuje pojistitele — proto tu není
 * jen název: „www.koop.cz" prozradí firmu stejně spolehlivě.
 */
const FORBIDDEN = [
  { label: "název pojistitele", re: /koopera\p{L}*/giu },
  { label: "web", re: /koop\.cz/gi },
  { label: "telefon", re: /957\s?105\s?105/g },
  { label: "skupina", re: /Vienna\s+Insurance\s+Group/gi },
  { label: "IČO", re: /47\s?116\s?617|471\s16\s617/g },
  {
    label: "sídlo",
    re: /Pobřežní\s*665\/21|Brněnská\s*634,\s*664\s*42|Na\s+Příkopě\s*28,\s*115\s*03/g,
  },
];

const PAGE = 500;

const { data: docs, error: docErr } = await sb
  .from("documents")
  .select("id, filename, status")
  .order("created_at");
if (docErr) {
  console.error("Načtení dokumentů selhalo:", docErr.message);
  process.exit(2);
}
const nameOf = Object.fromEntries(docs.map((d) => [d.id, d.filename]));

/** documentId → { label → { count, samples[] } } */
const hits = {};
let scanned = 0;

function inspect(docId, field, text) {
  if (!text) return;
  for (const { label, re } of FORBIDDEN) {
    for (const m of text.matchAll(re)) {
      const bucket = ((hits[docId] ??= {})[label] ??= { count: 0, samples: [] });
      bucket.count++;
      if (bucket.samples.length < 3) {
        const start = Math.max(0, m.index - 60);
        bucket.samples.push(
          `${field}: …${text
            .slice(start, m.index + m[0].length + 60)
            .replace(/\s+/g, " ")
            .trim()}…`
        );
      }
    }
  }
}

// Názvy souborů se zobrazují v bloku zdrojů, takže patří do kontroly taky.
for (const d of docs) inspect(d.id, "filename", d.filename);

for (let from = 0; ; from += PAGE) {
  const { data, error } = await sb
    .from("chunks")
    .select("document_id, content, section_path")
    .range(from, from + PAGE - 1);
  if (error) {
    console.error("Načtení chunků selhalo:", error.message);
    process.exit(2);
  }
  if (!data.length) break;
  for (const c of data) {
    scanned++;
    inspect(c.document_id, "content", c.content);
    inspect(c.document_id, "section_path", c.section_path);
  }
  if (data.length < PAGE) break;
}

console.log(
  `Prohledáno ${scanned} chunků v ${docs.length} dokumentech.\n`
);

const leaking = Object.keys(hits);
if (leaking.length === 0) {
  console.log("✓ Žádný zakázaný vzor nenalezen.");
  process.exit(0);
}

let total = 0;
for (const [docId, byLabel] of Object.entries(hits)) {
  const sum = Object.values(byLabel).reduce((a, b) => a + b.count, 0);
  total += sum;
  console.log(`✗ ${nameOf[docId] ?? docId} — ${sum} nálezů`);
  for (const [label, { count, samples }] of Object.entries(byLabel)) {
    console.log(`    ${String(count).padStart(4)}x  ${label}`);
    if (args.verbose) for (const s of samples) console.log(`          ${s}`);
  }
}
console.log(
  `\nCelkem ${total} nálezů v ${leaking.length} dokumentech. Reindexuj je v /admin/documents.`
);
process.exit(1);
