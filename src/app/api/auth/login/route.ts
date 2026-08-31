import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { clientIp } from "@/lib/rate-limit";
import { burnPasswordTime, verifyPassword } from "@/lib/password";
import {
  createSessionCookie,
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
// Od zavedení více účtů (etapa A plánu rolí) je to jen pojistka POSLEDNÍ
// instance — hlavní obranou je per-username limit níže. Nízký globální strop
// by se s více uživateli stal DoS vektorem: útočník by jím uzamkl přihlášení
// všem najednou.
const GLOBAL_MAX_FAILURES = 300;
// Per-username strop: cílený útok na jeden účet nezablokuje ostatní uživatele.
const MAX_ATTEMPTS_PER_USER = 5;

const failedAttempts = new Map<string, { count: number; windowStart: number }>();
// Stejná mechanika jako u IP, ale klíčem je uživatelské jméno (lowercase —
// username je v DB citext, takže velikost písmen nesmí limit obejít).
const failedByUser = new Map<string, { count: number; windowStart: number }>();
// Timestampy selhání napříč IP; roste jen do stropu (429 se už nezapočítává).
const globalFailures: number[] = [];

type Attempts = Map<string, { count: number; windowStart: number }>;

function isRateLimited(map: Attempts, key: string, max: number): boolean {
  const entry = map.get(key);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > WINDOW_MS) {
    map.delete(key);
    return false;
  }
  return entry.count >= max;
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
function evictAttempts(map: Attempts, max: number): void {
  const now = Date.now();
  let removed = 0;
  const remove = (key: string): boolean => {
    map.delete(key);
    return ++removed >= EVICT_COUNT;
  };
  for (const [key, entry] of map) {
    if (now - entry.windowStart > WINDOW_MS) {
      if (remove(key)) return;
    }
  }
  for (const [key, entry] of map) {
    if (entry.count < max) {
      if (remove(key)) return;
    }
  }
  for (const key of map.keys()) {
    if (remove(key)) return;
  }
}

function bumpAttempts(map: Attempts, key: string, max: number): void {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    if (!entry && map.size >= MAX_KEYS) evictAttempts(map, max);
    map.set(key, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
}

function recordFailure(ip: string, username: string): void {
  // Globální počítadlo úspěšný login neresetuje — jinak by si ho útočník
  // s platnými údaji mohl nulovat; okno vyprší samo.
  globalFailures.push(Date.now());
  bumpAttempts(failedAttempts, ip, MAX_ATTEMPTS);
  bumpAttempts(failedByUser, username, MAX_ATTEMPTS_PER_USER);
}

interface LoginRow {
  id: string;
  password_hash: string | null;
  is_active: boolean;
  auth_provider: string;
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (isRateLimited(failedAttempts, ip, MAX_ATTEMPTS) || isGloballyLimited()) {
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

  const username = body.username.trim();
  const userKey = username.toLowerCase();
  if (isRateLimited(failedByUser, userKey, MAX_ATTEMPTS_PER_USER)) {
    return NextResponse.json(
      { error: "Příliš mnoho pokusů o přihlášení. Zkuste to za 15 minut." },
      { status: 429 }
    );
  }

  // Neúspěch vypadá vždy stejně — hláška ani doba odpovědi nesmí prozradit,
  // jestli účet existuje (invariant 9 v plánu rolí).
  const fail = () => {
    recordFailure(ip, userKey);
    return NextResponse.json(
      { error: "Nesprávné uživatelské jméno nebo heslo" },
      { status: 401 }
    );
  };

  // username je v DB citext → porovnání ignoruje velikost písmen.
  const { data: user, error } = await supabase
    .from("users")
    .select("id, password_hash, is_active, auth_provider")
    .eq("username", username)
    .maybeSingle<LoginRow>();

  if (error) {
    console.error("Načtení uživatele při přihlášení selhalo:", error);
    return NextResponse.json(
      { error: "Přihlášení se nezdařilo. Zkuste to prosím za chvíli." },
      { status: 503 }
    );
  }

  // Neexistující, neaktivní i SSO účet: spálit srovnatelný čas a odmítnout.
  // SSO účet se heslem přihlásit nesmí ani kdyby password_hash existoval —
  // byla by to cesta okolo IdP, tedy okolo MFA i deaktivace (invariant 8).
  if (
    !user ||
    !user.is_active ||
    user.auth_provider !== "local" ||
    !user.password_hash
  ) {
    await burnPasswordTime(body.password);
    return fail();
  }

  if (!(await verifyPassword(body.password, user.password_hash))) {
    return fail();
  }

  failedAttempts.delete(ip);
  failedByUser.delete(userKey);

  const cookie = await createSessionCookie(config.sessionSecret, user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, cookie, COOKIE_OPTIONS);
  return res;
}
