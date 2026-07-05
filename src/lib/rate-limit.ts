// Sdílený in-memory rate limit (sliding window na klíč, typicky IP).
// Per-instance: na serverless (Vercel) počítá každá instance zvlášť a studený
// start počítadlo nuluje — jde o zmírnění zneužití, ne absolutní ochranu.
// Sdílené úložiště (Upstash/KV) je vědomý produkční dluh.

/** Pojistka proti neomezenému růstu mapy (mnoho různých klíčů/IP). */
const MAX_KEYS = 5000;
/** Kolik klíčů se při přetečení vystěhuje najednou. */
const EVICT_COUNT = Math.ceil(MAX_KEYS / 4);

export interface RateLimiterOptions {
  /** Maximální počet požadavků v okně. */
  limit: number;
  /** Délka klouzavého okna v ms. */
  windowMs: number;
}

/** Vrátí funkci `allow(key)` — true = požadavek projde, false = limit vyčerpán. */
export function createRateLimiter({ limit, windowMs }: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  // Oprava SEC-1: dřívější hits.clear() při přetečení resetoval počítadla
  // všech klientů najednou — útočník si přeplněním mapy nuloval vlastní limit.
  // Pořadí vystěhování: 1) vypršelá okna, 2) klíče pod limitem (nejstarší
  // první), 3) nouzově cokoli. Zablokované klíče (na limitu) tak přežijí,
  // dokud mapu nezaplní tisíce jiných zablokovaných klíčů — což už samo
  // vyžaduje řádově víc požadavků, než kolik jich obejití ušetří.
  function evict(cutoff: number): void {
    let removed = 0;
    const remove = (key: string): boolean => {
      hits.delete(key);
      return ++removed >= EVICT_COUNT;
    };
    for (const [key, stamps] of hits) {
      if (stamps.length === 0 || stamps[stamps.length - 1] <= cutoff) {
        if (remove(key)) return;
      }
    }
    for (const [key, stamps] of hits) {
      if (stamps.length < limit) {
        if (remove(key)) return;
      }
    }
    for (const key of hits.keys()) {
      if (remove(key)) return;
    }
  }

  return function allow(key: string): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;

    let stamps = hits.get(key);
    if (stamps) {
      while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();
    } else {
      if (hits.size >= MAX_KEYS) evict(cutoff);
      stamps = [];
      hits.set(key, stamps);
    }

    if (stamps.length >= limit) return false;
    stamps.push(now);
    return true;
  };
}

/**
 * IP klienta pro rate-limiting (oprava SEC-1). Levá hodnota `X-Forwarded-For`
 * je plně v rukou klienta (rotací hlavičky se obcházely limity), proto se bere:
 * 1. `x-real-ip` — na Vercelu ji dosazuje platforma a klientem poslanou
 *    hodnotu přepisuje;
 * 2. pravá (poslední) hodnota `x-forwarded-for` — dosazuje ji poslední
 *    důvěryhodný hop (reverse proxy / platforma);
 * 3. `"unknown"` — lokální dev bez proxy; všichni klienti pak sdílejí jedno
 *    počítadlo, což pro vývoj nevadí.
 * Mimo Vercel/proxy jsou obě hlavičky spoofovatelné — ochranu nezávislou na
 * IP řeší globální strop selhání u loginu (viz api/auth/login).
 */
export function clientIp(request: { headers: Headers }): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  const parts = xff.split(",");
  return parts[parts.length - 1].trim() || "unknown";
}
