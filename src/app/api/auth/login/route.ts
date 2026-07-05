import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { clientIp } from "@/lib/rate-limit";
import {
  createSessionCookie,
  safeEqual,
  SESSION_COOKIE_NAME,
  COOKIE_OPTIONS,
} from "@/lib/auth";

// Brute-force zmírnění: max 5 neúspěšných pokusů / 15 min na IP. In-memory mapa
// je per-instance — na serverless jde o zmírnění, ne absolutní ochranu (každá
// instance počítá zvlášť a restart počítadlo nuluje). Sémantika je záměrně
// vlastní (počítají se jen selhání, úspěch nuluje) — nesjednocovat na
// createRateLimiter z lib/rate-limit.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
// Strop velikosti mapy — stejná pojistka jako v lib/rate-limit (oprava SEC-5).
const MAX_KEYS = 5000;
const EVICT_COUNT = Math.ceil(MAX_KEYS / 4);
// Globální strop selhání nezávislý na IP (oprava SEC-1): identita IP jde mimo
// důvěryhodnou platformu spoofovat, proto druhá pojistka přes všechny IP.
// Jediný admin účet → po vlně útoku legitimní admin počká do konce okna.
const GLOBAL_MAX_FAILURES = 30;

const failedAttempts = new Map<string, { count: number; windowStart: number }>();
// Timestampy selhání napříč IP; roste jen do stropu (429 se už nezapočítává).
const globalFailures: number[] = [];

function isRateLimited(ip: string): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function isGloballyLimited(): boolean {
  const cutoff = Date.now() - WINDOW_MS;
  while (globalFailures.length > 0 && globalFailures[0] <= cutoff) {
    globalFailures.shift();
  }
  return globalFailures.length >= GLOBAL_MAX_FAILURES;
}

// Vystěhování při přetečení mapy — přednostně vypršelá okna, pak klíče pod
// limitem, nouzově cokoli; nikdy clear() (viz oprava SEC-1 v lib/rate-limit —
// zablokované klíče musí vystěhování přežít).
function evictFailedAttempts(): void {
  const now = Date.now();
  let removed = 0;
  const remove = (key: string): boolean => {
    failedAttempts.delete(key);
    return ++removed >= EVICT_COUNT;
  };
  for (const [key, entry] of failedAttempts) {
    if (now - entry.windowStart > WINDOW_MS) {
      if (remove(key)) return;
    }
  }
  for (const [key, entry] of failedAttempts) {
    if (entry.count < MAX_ATTEMPTS) {
      if (remove(key)) return;
    }
  }
  for (const key of failedAttempts.keys()) {
    if (remove(key)) return;
  }
}

function recordFailure(ip: string): void {
  const now = Date.now();
  // Globální počítadlo úspěšný login neresetuje — jinak by si ho útočník
  // s platnými údaji mohl nulovat; okno vyprší samo.
  globalFailures.push(now);
  const entry = failedAttempts.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    if (!entry && failedAttempts.size >= MAX_KEYS) evictFailedAttempts();
    failedAttempts.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (isRateLimited(ip) || isGloballyLimited()) {
    return NextResponse.json(
      { error: "Příliš mnoho pokusů o přihlášení. Zkuste to za 15 minut." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.username !== "string" ||
    typeof body.password !== "string" ||
    !body.username ||
    !body.password
  ) {
    return NextResponse.json(
      { error: "Uživatelské jméno a heslo jsou povinné" },
      { status: 400 }
    );
  }

  // Obě porovnání proběhnou vždy (žádný short-circuit) a jsou constant-time.
  const [userOk, passOk] = await Promise.all([
    safeEqual(body.username, config.adminUsername),
    safeEqual(body.password, config.adminPassword),
  ]);

  if (!userOk || !passOk) {
    recordFailure(ip);
    return NextResponse.json(
      { error: "Nesprávné uživatelské jméno nebo heslo" },
      { status: 401 }
    );
  }

  failedAttempts.delete(ip);
  const cookie = await createSessionCookie(config.sessionSecret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, cookie, COOKIE_OPTIONS);
  return res;
}
