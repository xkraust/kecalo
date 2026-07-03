// Sdílený in-memory rate limit (sliding window na klíč, typicky IP).
// Per-instance: na serverless (Vercel) počítá každá instance zvlášť a studený
// start počítadlo nuluje — jde o zmírnění zneužití, ne absolutní ochranu.

/** Pojistka proti neomezenému růstu mapy (např. spoofované X-Forwarded-For). */
const MAX_KEYS = 5000;

export interface RateLimiterOptions {
  /** Maximální počet požadavků v okně. */
  limit: number;
  /** Délka klouzavého okna v ms. */
  windowMs: number;
}

/** Vrátí funkci `allow(key)` — true = požadavek projde, false = limit vyčerpán. */
export function createRateLimiter({ limit, windowMs }: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  return function allow(key: string): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;

    let stamps = hits.get(key);
    if (stamps) {
      while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();
    } else {
      if (hits.size >= MAX_KEYS) hits.clear();
      stamps = [];
      hits.set(key, stamps);
    }

    if (stamps.length >= limit) return false;
    stamps.push(now);
    return true;
  };
}

/** IP klienta z X-Forwarded-For (na Vercelu ji nastavuje platforma). */
export function clientIp(request: { headers: Headers }): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}
