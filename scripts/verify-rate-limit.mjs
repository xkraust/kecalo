#!/usr/bin/env node
/**
 * Ověření opravy SEC-1 na nasazené aplikaci: rate-limit se klíčuje podle
 * skutečné IP (`x-real-ip`, kterou na Vercelu dosazuje platforma), ne podle
 * klientem spoofovatelné hlavičky `X-Forwarded-For`.
 *
 * Princip: pošle dávku požadavků na veřejnou routu /api/feedback, každý s JINOU
 * (falešnou) hlavičkou X-Forwarded-For. Protože kód XFF ignoruje a bere
 * x-real-ip (tvoji reálnou IP), všechny sdílejí jedno počítadlo → po vyčerpání
 * limitu (10/min) přijde 429. Kdyby limiter pořád klíčoval podle XFF (regrese),
 * 429 by nikdy nepřišlo.
 *
 * Čisté Node ESM, bez závislostí (globální fetch, Node 18+). Routa je veřejná,
 * takže není potřeba žádný token ani .env.
 *
 * Použití:
 *   node scripts/verify-rate-limit.mjs                # default: kecalo.vercel.app, dávka 20
 *   node scripts/verify-rate-limit.mjs --count=30     # větší dávka
 *   node scripts/verify-rate-limit.mjs --base=https://jina.vercel.app
 *
 * Pozn.: limiter je per-instance in-memory. Když 429 nepřijde napoprvé, spusť
 * skript ještě jednou — Vercel mohl požadavky rozprostřít mezi víc instancí
 * nebo přišel studený start (počítadlo se nuluje). Není to selhání opravy.
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

const BASE = (args.base || "https://kecalo.vercel.app").replace(/\/$/, "");
const COUNT = Number(args.count) || 20;
const SESSION_ID = args.sessionId || "rl-test";

const randomIp = () =>
  `9.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

console.log(`Cíl: ${BASE}/api/feedback`);
console.log(`Posílám ${COUNT} požadavků, každý s jinou X-Forwarded-For…\n`);

const codes = [];
for (let i = 1; i <= COUNT; i++) {
  let status;
  try {
    const res = await fetch(`${BASE}/api/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": randomIp(),
      },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        messageIndex: 0,
        rating: "up",
      }),
    });
    status = res.status;
  } catch (err) {
    status = `ERR ${err.message}`;
  }
  codes.push(status);
  console.log(`  ${String(i).padStart(2)}. → ${status}`);
}

const got429 = codes.includes(429);
console.log("\nVýsledek:", codes.join(", "));
if (got429) {
  console.log(
    "\n✅ PASS — objevilo se 429 navzdory rotující X-Forwarded-For.\n" +
      "   Limit se klíčuje podle x-real-ip (skutečné IP), spoofing XFF ho neobešel."
  );
} else {
  console.log(
    "\n⚠️  NEPRŮKAZNÉ — žádné 429.\n" +
      "   Buď se požadavky rozprostřely mezi víc serverless instancí / přišel\n" +
      "   studený start (per-instance limiter), nebo je limit vyšší než dávka.\n" +
      "   Spusť skript znovu, případně zvyš --count. Trvalá absence 429 při\n" +
      "   rychlé sekvenční dávce by ukazovala na regresi."
  );
}
console.log(
  `\n(Vznikl jeden feedback řádek se session_id="${SESSION_ID}" — volitelně smaž z DB.)`
);
