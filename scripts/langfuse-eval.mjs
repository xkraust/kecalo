#!/usr/bin/env node
// @ts-nocheck
/**
 * Langfuse eval runner — prožene testovací datasety přes nasazený /api/chat
 * a založí z výsledků experiment (dataset run) v Langfuse + deterministická skóre.
 *
 * Zápis jde přes oficiální SDK @langfuse/client (`experiment.run`), aby se run
 * objevil v záložce Experiments. (Ruční REST /dataset-run-items zakládal legacy
 * runy, které UI v3.205 v Experiments nezobrazuje.)
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
 *   ADMIN_USERNAME, ADMIN_PASSWORD  — volitelné; jen pro načtení runtime RAG
 *     parametrů z cíle (GET /api/settings je admin-only) do metadat runu
 */

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseClient } from "@langfuse/client";
import {
  setLangfuseTracerProvider,
  getActiveTraceId,
  getActiveSpanId,
  updateActiveObservation,
} from "@langfuse/tracing";

// ---------------------------------------------------------------------------
// Env — načteme .env.local a .env, ale nepřepíšeme už nastavené proměnné.
// (Musí proběhnout před konstrukcí LangfuseSpanProcessor/LangfuseClient — ty
//  čtou klíče z prostředí.)
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

const KECALO_BASE = (
  args["base-url"] || process.env.KECALO_BASE_URL || "https://kecalo.vercel.app"
).replace(/\/$/, "");
const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;

// Názvy datasetů včetně "složky" kecalo/ — prefix lze přepnout přes --prefix.
const PREFIX = args.prefix !== undefined ? String(args.prefix) : "kecalo/";
const DATASETS = (
  args.dataset ? String(args.dataset).split(",") : ["obecne", "M-100", "M-200"]
).map((d) => (d.includes("/") ? d : PREFIX + d));

const ONLY = args.only ? String(args.only) : null; // in_scope | out_of_scope | confusion
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const DRY = Boolean(args.dry);
const DELAY_MS = args.delay ? Number(args.delay) : 3000; // rate limit /api/chat = 20/min
const RUN_NAME =
  (args.run && String(args.run)) ||
  `eval-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

if (!PUBLIC_KEY || !SECRET_KEY) {
  console.error(
    "Chybí LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY (v .env.local nebo prostředí)."
  );
  process.exit(1);
}

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
/** Jako norm(), ale ponechá diakritiku (pro regex „článek" nad section_path). */
function norm2(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ");
}
/** Langfuse dataset item může mít input jako string i objekt — vytáhneme text. */
function asText(v) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") return v.text || v.content || JSON.stringify(v);
  return String(v ?? "");
}

/** Zavolá nasazený chat, vrátí { answer, sources, status, error }. */
async function callChat(question, traceparent) {
  const headers = { "Content-Type": "application/json" };
  if (traceparent) headers.traceparent = traceparent;
  try {
    const res = await fetch(`${KECALO_BASE}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
    });
    const answer = await res.text();
    let sources = [];
    const hdr = res.headers.get("x-sources");
    if (hdr) {
      try {
        sources = JSON.parse(decodeURIComponent(hdr));
      } catch {
        /* prázdné / nevalidní → [] */
      }
    }
    return { answer, sources, status: res.status, error: !res.ok };
  } catch (err) {
    return { answer: String(err), sources: [], status: 0, error: true };
  }
}

/** Krátký git sha aplikace v době běhu — pro metadata runu. Null když není git. */
function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Runtime RAG parametry z cíle (GET /api/settings je admin-only → nejdřív login
 * přes ADMIN_USERNAME/ADMIN_PASSWORD, pak dotaz se session cookie). Vrací objekt
 * settings, nebo null (chybí creds / login selhal) — metadata runu se pak jen
 * o settings ochudí, běh pokračuje.
 */
async function fetchTargetSettings() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return null;
  try {
    const login = await fetch(`${KECALO_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!login.ok) {
      console.warn(`  (settings do metadat přeskočena — login ${login.status})`);
      return null;
    }
    const setCookies = login.headers.getSetCookie?.() ??
      [login.headers.get("set-cookie")].filter(Boolean);
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
    if (!cookie) return null;
    const res = await fetch(`${KECALO_BASE}/api/settings`, {
      headers: { Cookie: cookie },
    });
    if (!res.ok) {
      console.warn(`  (settings do metadat přeskočena — /api/settings ${res.status})`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`  (settings do metadat přeskočena — ${err.message})`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deterministická skóre — z výstupu chatu + metadat položky.
// Vrací pole Evaluation { name, value, comment, dataType }.
// value: 1 = OK, 0 = fail.
// ---------------------------------------------------------------------------
function deterministicScores(output, metadata) {
  const { answer = "", sources = [], status = 0, error = false } = output || {};
  const scores = [];
  const category = metadata?.category ?? "in_scope";
  const isFallback = sources.length === 0;
  const num = (name, value, comment) =>
    scores.push({ name, value, comment, dataType: "NUMERIC" });

  if (error) {
    num("http_ok", 0, `HTTP ${status}`);
    return scores;
  }

  if (category === "out_of_scope") {
    const mentionsHotline = /infolinku|800\s?123\s?456/i.test(answer);
    num(
      "fallback_correct",
      isFallback || mentionsHotline ? 1 : 0,
      isFallback
        ? "X-Sources prázdné → čistý fallback"
        : mentionsHotline
        ? "chunky nad prahem, ale odpověď odkazuje na infolinku"
        : `POZOR: ${sources.length} zdrojů a bez odkazu na infolinku (možná halucinace)`
    );
    return scores;
  }

  // in_scope + confusion
  num("retrieved", sources.length > 0 ? 1 : 0, `${sources.length} chunků`);

  const expectedDoc = metadata?.document ? norm(metadata.document) : null;
  if (expectedDoc) {
    const docMatch = sources.some((s) => norm(s.filename).includes(expectedDoc));
    num(
      "doc_match",
      docMatch ? 1 : 0,
      docMatch
        ? `zdroj odpovídá ${metadata.document}`
        : `očekáván ${metadata.document}, vráceno: ${
            sources.map((s) => s.filename).join(" | ") || "nic"
          }`
    );
  }

  const artMatch = String(metadata?.expected_source || "").match(/čl\.?\s*(\d+)/i);
  if (artMatch) {
    const n = artMatch[1];
    const re = new RegExp(`(?:čl\\.?|článek)\\s*${n}\\b`, "i");
    const hit = sources.some((s) => re.test(norm2(s.section)));
    num(
      "article_match",
      hit ? 1 : 0,
      hit
        ? `sekce obsahuje čl. ${n}`
        : `očekáván čl. ${n}; sekce: ${
            sources.map((s) => s.section).filter(Boolean).join(" | ") || "žádné"
          }`
    );
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Agregace pro souhrn
// ---------------------------------------------------------------------------
const agg = {};
function bump(scores) {
  for (const s of scores) {
    agg[s.name] ??= { sum: 0, n: 0 };
    agg[s.name].sum += s.value;
    agg[s.name].n += 1;
  }
}
function printItem(category, question, scores) {
  const flag = scores.some((s) => s.value === 0) ? "✗" : "✓";
  const str = scores.map((s) => `${s.name}=${s.value}`).join(" ");
  console.log(`  ${flag} [${category ?? "?"}] ${asText(question).slice(0, 58)}…  ${str}`);
}

// ---------------------------------------------------------------------------
// OTel setup — bez registrovaného provideru by byl tracer NoopTracer a experiment
// by nevytvořil žádné spany/traces. Registrujeme Langfuse span processor.
// ---------------------------------------------------------------------------
const spanProcessor = new LangfuseSpanProcessor({
  exportMode: "immediate", // krátký skript — posíláme hned, nespoléháme na batch
  shouldExportSpan: () => true,
});
const provider = new NodeTracerProvider({ spanProcessors: [spanProcessor] });
provider.register();
setLangfuseTracerProvider(provider);

const langfuse = new LangfuseClient();

// task pro experiment.run — běží uvnitř aktivní observace, takže getActiveTraceId
// vrací id experiment trace; přes traceparent vnoříme i serverové spany chatu.
async function task(item) {
  await sleep(DELAY_MS); // throttle kvůli rate limitu (maxConcurrency=1)
  const tid = getActiveTraceId?.();
  const sid = getActiveSpanId?.();
  const traceparent = tid && sid ? `00-${tid}-${sid}-01` : undefined;
  const out = await callChat(asText(item.input), traceparent);

  // Per-item metadata na observaci — filtrovatelné v UI (status, retrieval).
  const topSimilarity = out.sources.length
    ? Math.max(...out.sources.map((s) => s.similarity ?? 0))
    : 0;
  try {
    updateActiveObservation({
      metadata: {
        httpStatus: out.status,
        chunkCount: out.sources.length,
        topSimilarity,
        sources: out.sources,
      },
    });
  } catch {
    /* no-op mimo aktivní observaci (např. při ručním volání) */
  }
  return out;
}

// jediný evaluátor vrací pole deterministických skóre
async function evaluator({ output, metadata }) {
  return deterministicScores(output, metadata);
}

// run-level agregace — z per-item skóre spočítá průměrné míry (0–1) a připne je
// jako skóre na celý run (např. doc_match_rate). Umožní porovnávat runy jedním
// číslem místo ručního průměrování v konzoli.
async function runEvaluator({ itemResults }) {
  const acc = {};
  for (const r of itemResults) {
    for (const e of r.evaluations ?? []) {
      acc[e.name] ??= { sum: 0, n: 0 };
      acc[e.name].sum += e.value;
      acc[e.name].n += 1;
    }
  }
  return Object.entries(acc).map(([name, { sum, n }]) => ({
    name: `${name}_rate`,
    value: n ? sum / n : 0,
    comment: `${sum}/${n}`,
    dataType: "NUMERIC",
  }));
}

// ---------------------------------------------------------------------------
// Běh
// ---------------------------------------------------------------------------
async function main() {
  // Metadata runu — poznají, proti jaké konfiguraci/kódu run běžel (porovnání runů).
  const targetSettings = DRY ? null : await fetchTargetSettings();
  const runMetadata = {
    target: KECALO_BASE,
    gitSha: gitSha(),
    cli: {
      datasets: DATASETS,
      only: ONLY,
      limit: LIMIT === Infinity ? null : LIMIT,
      delayMs: DELAY_MS,
    },
    settings: targetSettings, // topK/threshold/temperature + chunking (nebo null)
  };

  console.log(`Run:      ${RUN_NAME}`);
  console.log(`Chat:     ${KECALO_BASE}/api/chat`);
  console.log(`Langfuse: ${process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"}`);
  console.log(`Datasety: ${DATASETS.join(", ")}${ONLY ? `  (only=${ONLY})` : ""}`);
  console.log(
    `Metadata: git=${runMetadata.gitSha ?? "?"}` +
      (targetSettings
        ? ` topK=${targetSettings.topK} thr=${targetSettings.similarityThreshold} temp=${targetSettings.llmTemperature} chunk=${targetSettings.chunkTargetSize}/breadcrumb=${targetSettings.chunkBreadcrumb}`
        : DRY
        ? ""
        : " (settings N/A)")
  );
  console.log(DRY ? "DRY RUN — do Langfuse se nic nezapíše.\n" : "");

  let processed = 0;

  for (const datasetName of DATASETS) {
    let dataset;
    try {
      dataset = await langfuse.dataset.get(datasetName);
    } catch (err) {
      console.error(`Dataset "${datasetName}" nelze načíst: ${err.message}`);
      continue;
    }
    let items = dataset.items;
    if (ONLY) items = items.filter((i) => (i.metadata?.category ?? null) === ONLY);
    if (LIMIT !== Infinity) items = items.slice(0, Math.max(0, LIMIT - processed));
    if (items.length === 0) continue;

    console.log(`\n=== ${datasetName} (${items.length} položek) ===`);

    if (DRY) {
      // Bez SDK zápisu — jen zavoláme chat a vypíšeme skóre.
      for (const item of items) {
        const out = await callChat(asText(item.input));
        const scores = deterministicScores(out, item.metadata);
        bump(scores);
        printItem(item.metadata?.category, item.input, scores);
        processed++;
        await sleep(DELAY_MS);
      }
    } else {
      const result = await langfuse.experiment.run({
        name: `kecalo-eval:${datasetName}`,
        runName: RUN_NAME,
        description: "Deterministická evaluace RAG chatbota (retrieval + fallback)",
        metadata: runMetadata,
        data: items,
        task,
        evaluators: [evaluator],
        runEvaluators: [runEvaluator],
        maxConcurrency: 1,
      });
      for (const r of result.itemResults) {
        bump(r.evaluations);
        printItem(r.item?.metadata?.category, r.input ?? r.item?.input, r.evaluations);
        processed++;
      }
    }
    if (processed >= LIMIT) break;
  }

  console.log(`\n=== Souhrn (${processed} otázek) ===`);
  for (const [name, { sum, n }] of Object.entries(agg)) {
    const pct = n ? Math.round((sum / n) * 100) : 0;
    console.log(`  ${name.padEnd(18)} ${sum}/${n}  (${pct} %)`);
  }

  if (!DRY) {
    await langfuse.flush();
    await spanProcessor.forceFlush();
    console.log(
      `\nHotovo. Experiment "${RUN_NAME}" najdeš v Langfuse → Datasets → <dataset> → Experiments.`
    );
  }
  await provider.shutdown();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await provider.shutdown();
  } catch {}
  process.exit(1);
});
