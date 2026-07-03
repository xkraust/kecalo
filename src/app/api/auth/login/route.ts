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
// instance počítá zvlášť a restart počítadlo nuluje).
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
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
