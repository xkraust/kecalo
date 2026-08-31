// Podpis a ověření admin session cookie (HMAC-SHA256 přes Web Crypto — funguje
// v Node i edge runtime proxy). Podpisový klíč je SESSION_SECRET (nikdy ne
// heslo — uniklá cookie by jinak umožnila offline brute-force hesla).
//
// Formát v2 (etapa A plánu rolí): `v2.ts.uid.nonce.sig`. Oproti v1 nese id
// uživatele, takže session je vázaná na konkrétní účet. Aplikační role ani
// štítky se do cookie ZÁMĚRNĚ nedávají — čtou se z DB při každém požadavku,
// aby odebrání oprávnění platilo okamžitě a cookie nebyla zdrojem pravdy.
export const SESSION_COOKIE_NAME = "admin_session";
const SESSION_VERSION = "v2";
// 8 h; revokaci před vypršením řeší per-user sessions_invalid_before.
const SESSION_MAX_AGE = 28800;

const enc = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

/** Cookie má tvar `v2.ts.uid.nonce.sig` — nonce zajišťuje, že tokeny nejsou deterministické. */
export async function createSessionCookie(
  secret: string,
  userId: string
): Promise<string> {
  // Tečka je oddělovač; uuid ji neobsahuje, ale kontrola je levná pojistka
  // proti podvržení dalších segmentů přes uměle sestavené id.
  if (userId.includes(".")) throw new Error("Neplatné id uživatele pro session");
  const ts = Date.now().toString();
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const data = `${SESSION_VERSION}.${ts}.${userId}.${nonce}`;
  const key = await hmacKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${toHex(new Uint8Array(sig))}`;
}

/** Ověřená session: kdo ji vlastní a kdy byla vydána. */
export interface VerifiedSession {
  userId: string;
  issuedAt: number;
}

/**
 * Ověří podpis a stáří cookie a vrátí id uživatele s časem vydání, nebo `null`
 * když je neplatná/expirovaná. Čistá krypto (žádný I/O) → bezpečné i v edge
 * runtime proxy. Čas vydání využívá revokace session (SEC-4 + per-user
 * revokace): token vydaný před logoutem se odmítne, i když podpis a expirace
 * sedí. Ověření role a revokace probíhá až v Node vrstvě (session-user.ts).
 *
 * Starý formát v1 (`ts.nonce.sig`) je záměrně odmítnut — nenese uživatele,
 * takže by se nedal navázat na účet. Jediný dosavadní admin se po nasazení
 * jednou přihlásí znovu.
 */
export async function verifySessionCookie(
  value: string,
  secret: string
): Promise<VerifiedSession | null> {
  if (!secret) return null;

  const parts = value.split(".");
  if (parts.length !== 5) return null;
  const [version, ts, userId, nonce, sigHex] = parts;
  if (version !== SESSION_VERSION || !userId) return null;

  const issuedAt = parseInt(ts, 10);
  const age = Date.now() - issuedAt;
  if (isNaN(age) || age < 0 || age > SESSION_MAX_AGE * 1000) return null;

  const sig = fromHex(sigHex);
  if (!sig || sig.length !== 32) return null;

  // crypto.subtle.verify porovnává podpis constant-time (na rozdíl od ===).
  const key = await hmacKey(secret, "verify");
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    enc.encode(`${version}.${ts}.${userId}.${nonce}`)
  );
  return ok ? { userId, issuedAt } : null;
}

/** Rychlá kontrola podpisu a expirace pro edge proxy (bez přístupu k DB). */
export async function verifySession(
  value: string,
  secret: string
): Promise<boolean> {
  return (await verifySessionCookie(value, secret)) !== null;
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
