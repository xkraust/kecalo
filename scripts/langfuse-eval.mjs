#!/usr/bin/env node
// @ts-nocheck
/**
 * Langfuse eval runner — prožene testovací datasety přes nasazený /api/chat
 * a založí z výsledků experiment (dataset run) v Langfuse + deterministická skóre.
 *
 * Čisté Node ESM, bez nových závislostí (globální fetch, Node 18+).
 *
 * Použití:
 *   node scripts/langfuse-eval.mjs                       # všechny 3 datasety
 *   node scripts/langfuse-eval.mjs --dataset=M-100       # jen jeden
 *   node scripts/langfuse-eval.mjs --only=out_of_scope   # jen fallback otázky
 *   node scripts/langfuse-eval.mjs --run=baseline        # vlastní název runu
 *   node scripts/langfuse-eval.mjs --limit=3 --dry       # 3 otázky, bez zápisu do Langfuse
 *
 * Env (z .env.local / .env, nebo z prostředí):
 *   LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY  — povinné
 *   LANGFUSE_BASE_URL   — default https://cloud.langfuse.com
 *   KECALO_BASE_URL     — cíl chatu, default https://kecalo.vercel.app
 */

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Env — načteme .env.local a .env, ale nepřepíšeme už nastavené proměnné.
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

// ---------------------------------------------------------------------------
// Argumenty
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

const LANGFUSE_BASE = (
  process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"
).replace(/\/$/, "");
const KECALO_BASE = (
  args["base-url"] || process.env.KECALO_BASE_URL || "https://kecalo.vercel.app"
).replace(/\/$/, "");
const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;

// Názvy datasetů včetně "složky" kecalo/ — Langfuse ji v UI zobrazí zvlášť,
// ale API vyžaduje plný název. Prefix lze přepnout přes --prefix (default "kecalo/").
const PREFIX = args.prefix !== undefined ? String(args.prefix) : "kecalo/";
const DATASETS = (
  args.dataset ? String(args.dataset).split(",") : ["obecne", "M-100", "M-200"]
).map((d) => (d.includes("/") ? d : PREFIX + d));
const ONLY = args.only ? String(args.only) : null; // in_scope | out_of_scope | confusion
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const DRY = Boolean(args.dry);
const DELAY_MS = args.delay ? Number(args.delay) : 3000; // kvůli rate limitu 20/min na /api/chat
const RUN_NAME =
  (args.run && String(args.run)) ||
  `eval-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

if (!PUBLIC_KEY || !SECRET_KEY) {
  console.error(
    "Chybí LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY (v .env.local nebo prostředí)."
  );
  process.exit(1);
}

const AUTH =
  "Basic " + Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString("base64");

// ---------------------------------------------------------------------------
// Helpery
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => randomBytes(n).toString("hex");

/** Odstraní diakritiku a sjednotí mezery/velikost — pro robustní porovnávání. */
function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Langfuse může vrátit input jako string i jako objekt — vytáhneme text. */
function asText(v) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") return v.text || v.content || JSON.stringify(v);
  return String(v ?? "");
}

async function lf(path, method, body) {
  const res = await fetch(`${LANGFUSE_BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Langfuse ${method} ${path} → ${res.status} ${t}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Načte položky datasetu z Langfuse (input / expectedOutput / metadata). */
async function fetchItems(datasetName) {
  const out = [];
  let page = 1;
  for (;;) {
    const q = new URLSearchParams({
      datasetName,
      limit: "100",
      page: String(page),
    });
    const json = await lf(`/api/public/dataset-items?${q}`, "GET");
    const data = json.data || [];
    out.push(...data);
    const total = json.meta?.totalPages ?? 1;
    if (page >= total || data.length === 0) break;
    page++;
  }
  // Aktivní položky, případně filtr podle kategorie.
  return out.filter((it) => {
    if (it.status && it.status !== "ACTIVE") return false;
    if (ONLY && (it.metadata?.category ?? null) !== ONLY) return false;
    return true;
  });
}

/** Zavolá nasazený chat a vrátí { answer, sources, status, error }. */
async function callChat(question, traceId) {
  const spanId = hex(8);
  try {
    const res = await fetch(`${KECALO_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Best-effort propagace: pokud server extrahuje traceparent, jeho OTel
        // spany (retrieval → LLM) se zařadí pod stejné trace id jako náš experiment.
        // Pokud ne, nevadí — vlastní trace-create níže zajistí viditelný trace tak jako tak.
        traceparent: `00-${traceId}-${spanId}-01`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: question }],
      }),
    });
    const answer = await res.text();
    let sources = [];
    const hdr = res.headers.get("x-sources");
    if (hdr) {
      try {
        sources = JSON.parse(decodeURIComponent(hdr));
      } catch {
        /* prázdné / nevalidní → necháme [] */
      }
    }
    return { answer, sources, status: res.status, error: !res.ok };
  } catch (err) {
    return { answer: String(err), sources: [], status: 0, error: true };
  }
}

// ---------------------------------------------------------------------------
// Deterministická evaluace — vrací pole skóre { name, value, comment }.
// value: 1 = OK, 0 = fail (NUMERIC skóre v Langfuse).
// ---------------------------------------------------------------------------
function evaluate({ metadata, answer, sources, status, error }) {
  const scores = [];
  const category = metadata?.category ?? "in_scope";
  const isFallback = sources.length === 0;

  if (error) {
    scores.push({
      name: "http_ok",
      value: 0,
      comment: `HTTP ${status}`,
    });
    return scores;
  }

  if (category === "out_of_scope") {
    // Očekáváme fallback: retrieval nic nepustil (X-Sources prázdné). Sekundárně
    // ověříme i text (odkaz na infolinku), kdyby přišly hraniční chunky nad prahem.
    const mentionsHotline = /infolinku|800\s?123\s?456/i.test(answer);
    scores.push({
      name: "fallback_correct",
      value: isFallback || mentionsHotline ? 1 : 0,
      comment: isFallback
        ? "X-Sources prázdné → čistý fallback"
        : mentionsHotline
        ? "chunky nad prahem, ale odpověď odkazuje na infolinku"
        : `POZOR: vrátilo ${sources.length} zdrojů a neodkazuje na infolinku (možná halucinace)`,
    });
    return scores;
  }

  // in_scope + confusion: hodnotíme retrieval (dokument + článek).
  scores.push({
    name: "retrieved",
    value: sources.length > 0 ? 1 : 0,
    comment: `${sources.length} chunků`,
  });

  const expectedDoc = metadata?.document ? norm(metadata.document) : null;
  if (expectedDoc) {
    const filenames = sources.map((s) => norm(s.filename));
    const docMatch = filenames.some((f) => f.includes(expectedDoc));
    scores.push({
      name: "doc_match",
      value: docMatch ? 1 : 0,
      comment: docMatch
        ? `zdroj odpovídá ${metadata.document}`
        : `očekáván ${metadata.document}, retrieval vrátil: ${
            sources.map((s) => s.filename).join(" | ") || "nic"
          }`,
    });
  }

  // Kontrola článku — jen když je v expected_source uveden "čl. N".
  const artMatch = String(metadata?.expected_source || "").match(/čl\.?\s*(\d+)/i);
  if (artMatch) {
    const n = artMatch[1];
    const re = new RegExp(`(?:čl\\.?|článek)\\s*${n}\\b`, "i");
    const hit = sources.some((s) => re.test(norm2(s.section)));
    scores.push({
      name: "article_match",
      value: hit ? 1 : 0,
      comment: hit
        ? `sekce obsahuje čl. ${n}`
        : `očekáván čl. ${n}; sekce zdrojů: ${
            sources.map((s) => s.section).filter(Boolean).join(" | ") || "žádné"
          }`,
    });
  }

  return scores;
}

/** Jako norm(), ale ponechá diakritiku názvů sekcí čitelnou pro regex „článek". */
function norm2(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Zápis do Langfuse: trace-create + score-create přes ingestion, pak run item.
// ---------------------------------------------------------------------------
async function logToLangfuse({ item, dataset, question, result, scores, traceId }) {
  const now = new Date().toISOString();
  const batch = [
    {
      id: hex(8),
      type: "trace-create",
      timestamp: now,
      body: {
        id: traceId,
        name: `eval:${dataset}`,
        timestamp: now,
        input: question,
        output: result.answer,
        metadata: {
          ...item.metadata,
          runName: RUN_NAME,
          dataset,
          httpStatus: result.status,
          sources: result.sources,
          expectedOutput: asText(item.expectedOutput),
        },
      },
    },
    ...scores.map((s) => ({
      id: hex(8),
      type: "score-create",
      timestamp: now,
      body: {
        id: hex(8),
        traceId,
        name: s.name,
        value: s.value,
        dataType: "NUMERIC",
        comment: s.comment,
      },
    })),
  ];

  await lf("/api/public/ingestion", "POST", { batch });

  // Napojení trace na experiment (dataset run).
  await lf("/api/public/dataset-run-items", "POST", {
    runName: RUN_NAME,
    datasetItemId: item.id,
    traceId,
    metadata: { dataset },
  });
}

// ---------------------------------------------------------------------------
// Hlavní smyčka
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Run:      ${RUN_NAME}`);
  console.log(`Chat:     ${KECALO_BASE}/api/chat`);
  console.log(`Langfuse: ${LANGFUSE_BASE}`);
  console.log(`Datasety: ${DATASETS.join(", ")}${ONLY ? `  (only=${ONLY})` : ""}`);
  if (DRY) console.log("DRY RUN — do Langfuse se nic nezapíše.\n");
  else console.log("");

  const agg = {}; // { scoreName: { sum, n } }
  const bump = (name, v) => {
    agg[name] ??= { sum: 0, n: 0 };
    agg[name].sum += v;
    agg[name].n += 1;
  };

  let processed = 0;

  for (const dataset of DATASETS) {
    let items;
    try {
      items = await fetchItems(dataset);
    } catch (err) {
      console.error(`Dataset "${dataset}" nelze načíst: ${err.message}`);
      continue;
    }
    console.log(`\n=== ${dataset} (${items.length} položek) ===`);

    for (const item of items) {
      if (processed >= LIMIT) break;
      processed++;

      const question = asText(item.input);
      const traceId = hex(16); // 32 hex znaků — kompatibilní s OTel trace id
      const result = await callChat(question, traceId);
      const scores = evaluate({ ...result, metadata: item.metadata });

      for (const s of scores) bump(s.name, s.value);

      const flag = scores.some((s) => s.value === 0) ? "✗" : "✓";
      const scoreStr = scores.map((s) => `${s.name}=${s.value}`).join(" ");
      console.log(
        `  ${flag} [${item.metadata?.category ?? "?"}] ${question.slice(0, 60)}…  ${scoreStr}`
      );

      if (!DRY) {
        try {
          await logToLangfuse({ item, dataset, question, result, scores, traceId });
        } catch (err) {
          console.error(`    ! zápis do Langfuse selhal: ${err.message}`);
        }
      }

      await sleep(DELAY_MS);
    }
    if (processed >= LIMIT) break;
  }

  console.log(`\n=== Souhrn (${processed} otázek) ===`);
  for (const [name, { sum, n }] of Object.entries(agg)) {
    const pct = n ? Math.round((sum / n) * 100) : 0;
    console.log(`  ${name.padEnd(18)} ${sum}/${n}  (${pct} %)`);
  }
  if (!DRY) {
    console.log(
      `\nHotovo. Experiment "${RUN_NAME}" najdeš v Langfuse → Datasets → <dataset> → Experiments.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
