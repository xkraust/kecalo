#!/usr/bin/env node
/**
 * Sync příznaku `expects_offer` z CSV datasetů do metadat existujících
 * Langfuse dataset items (upsert podle id — datasety se NEvytvářejí znovu,
 * jejich datasetId používá filtr judge pravidla „Correctness in Czech";
 * re-import CSV přes UI by navíc založil duplicitní položky).
 *
 * Zdroj pravdy: docs/langfuse_datasets/*.csv (sloupec expects_offer).
 * Párování s Langfuse items je exact-match podle input (po trim) — při
 * nespárování nebo duplicitní shodě skript skončí chybou a nic nezapíše.
 *
 * Použití:
 *   node scripts/langfuse-sync-metadata.mjs                 # všechny 3 datasety
 *   node scripts/langfuse-sync-metadata.mjs --dataset=M-100 # jen jeden
 *   node scripts/langfuse-sync-metadata.mjs --dry           # jen výpis, bez zápisu
 *
 * Env (z .env.local / .env): LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY,
 * LANGFUSE_BASE_URL (default https://cloud.langfuse.com).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Env — stejně jako langfuse-eval.mjs: .env.local a .env, bez přepisu.
// ---------------------------------------------------------------------------
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
    const key = m[1];
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

const BASE_URL = (
  process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"
).replace(/\/$/, "");
const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;
const DRY = Boolean(args.dry);

if (!PUBLIC_KEY || !SECRET_KEY) {
  console.error(
    "Chybí LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY (v .env.local nebo prostředí)."
  );
  process.exit(1);
}

const AUTH = "Basic " + Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString("base64");

// CSV soubor → název datasetu v Langfuse (stejný prefix „kecalo/" jako runner).
const DATASET_FILES = {
  "kecalo/obecne": "dataset_obecne.csv",
  "kecalo/M-100": "dataset_M-100_23.csv",
  "kecalo/M-200": "dataset_M-200_23.csv",
};

const only = args.dataset ? String(args.dataset) : null;
const datasets = Object.entries(DATASET_FILES).filter(
  ([name]) => !only || name === (only.includes("/") ? only : `kecalo/${only}`)
);
if (datasets.length === 0) {
  console.error(`Neznámý dataset "${only}" — očekávám obecne | M-100 | M-200.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Mini RFC4180 parser — pole v uvozovkách se zdvojenými "" uvnitř; naivní
// split(",") by na datech selhal (názvy typu „bytový dům"" v textu).
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/** CSV → [{ input, expectsOffer: true|false|null }] */
function readCsvFlags(csvPath) {
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const header = rows[0];
  const inputIdx = header.indexOf("input");
  const flagIdx = header.indexOf("expects_offer");
  if (inputIdx === -1 || flagIdx === -1) {
    throw new Error(`${csvPath}: chybí sloupec input nebo expects_offer`);
  }
  return rows.slice(1).map((r) => {
    const raw = (r[flagIdx] ?? "").trim().toLowerCase();
    return {
      input: (r[inputIdx] ?? "").trim(),
      expectsOffer: raw === "true" ? true : raw === "false" ? false : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Langfuse public API (bez SDK — GET items + upsert POST podle id)
// ---------------------------------------------------------------------------
async function fetchAllItems(datasetName) {
  const items = [];
  for (let page = 1; ; page++) {
    const url =
      `${BASE_URL}/api/public/dataset-items` +
      `?datasetName=${encodeURIComponent(datasetName)}&page=${page}&limit=100`;
    const res = await fetch(url, { headers: { Authorization: AUTH } });
    if (!res.ok) {
      throw new Error(`GET dataset-items ${datasetName}: HTTP ${res.status}`);
    }
    const body = await res.json();
    items.push(...body.data);
    if (page >= (body.meta?.totalPages ?? 1)) break;
  }
  return items;
}

/** Upsert item podle id — přepíše metadata, input/expectedOutput zachová. */
async function upsertItem(datasetName, item, metadata) {
  const res = await fetch(`${BASE_URL}/api/public/dataset-items`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: item.id,
      datasetName,
      input: item.input,
      expectedOutput: item.expectedOutput,
      metadata,
      status: item.status ?? "ACTIVE",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST dataset-items (${item.id}): HTTP ${res.status} ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Běh
// ---------------------------------------------------------------------------
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const csvDir = join(scriptsDir, "..", "docs", "langfuse_datasets");

async function main() {
  console.log(`Langfuse: ${BASE_URL}${DRY ? "   (DRY RUN — bez zápisu)" : ""}`);
  let updated = 0;
  let skipped = 0;

  for (const [datasetName, csvFile] of datasets) {
    const csvRows = readCsvFlags(join(csvDir, csvFile));
    const items = await fetchAllItems(datasetName);
    console.log(`\n=== ${datasetName} (CSV ${csvRows.length} řádků, Langfuse ${items.length} items) ===`);

    // Fail loudly: každý CSV řádek se štítkem musí mít právě jeden protějšek.
    const errors = [];
    const plan = [];
    for (const row of csvRows) {
      const matches = items.filter((it) => {
        const input = typeof it.input === "string" ? it.input : JSON.stringify(it.input);
        return input.trim() === row.input;
      });
      if (row.expectsOffer === null) {
        skipped++;
        continue; // šedá zóna — bez příznaku, neskóruje se
      }
      if (matches.length !== 1) {
        errors.push(
          `  ${matches.length === 0 ? "NENALEZENO" : `DUPLICITA (${matches.length}×)`}: ${row.input.slice(0, 70)}`
        );
        continue;
      }
      plan.push({ item: matches[0], expectsOffer: row.expectsOffer });
    }
    if (errors.length > 0) {
      console.error(`Párování selhalo — nic se nezapisuje:\n${errors.join("\n")}`);
      process.exit(1);
    }

    for (const { item, expectsOffer } of plan) {
      const current = item.metadata?.expects_offer;
      const label = expectsOffer ? "true " : "false";
      if (current === expectsOffer) {
        console.log(`  = ${label}  ${String(item.input).slice(0, 60)}… (beze změny)`);
        continue;
      }
      if (!DRY) {
        await upsertItem(datasetName, item, {
          ...(item.metadata ?? {}),
          expects_offer: expectsOffer,
        });
      }
      updated++;
      console.log(`  ✓ ${label}  ${String(item.input).slice(0, 60)}…`);
    }
  }

  console.log(
    `\nHotovo: ${updated} ${DRY ? "k zápisu (dry run)" : "aktualizováno"}, ${skipped} bez příznaku (šedá zóna).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
