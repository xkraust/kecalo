// Podpis a ověření admin session cookie (HMAC-SHA256 přes Web Crypto — funguje
// v Node i edge runtime middlewaru). Podpisový klíč je SESSION_SECRET (nikdy ne
// ADMIN_PASSWORD — uniklá cookie by jinak umožnila offline brute-force hesla).
export const SESSION_COOKIE_NAME = "admin_session";
// 8 h — zmírnění chybějící server-side invalidace (logout jen maže cookie,
// token platí do expirace; dokumentované omezení prototypu).
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

/** Cookie má tvar `ts.nonce.sig` — nonce zajišťuje, že tokeny nejsou deterministické. */
export async function createSessionCookie(secret: string): Promise<string> {
  const ts = Date.now().toString();
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const data = `${ts}.${nonce}`;
  const key = await hmacKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${toHex(new Uint8Array(sig))}`;
}

export async function verifySession(
  value: string,
  secret: string
): Promise<boolean> {
  if (!secret) return false;

  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [ts, nonce, sigHex] = parts;

  const age = Date.now() - parseInt(ts, 10);
  if (isNaN(age) || age < 0 || age > SESSION_MAX_AGE * 1000) return false;

  const sig = fromHex(sigHex);
  if (!sig || sig.length !== 32) return false;

  // crypto.subtle.verify porovnává podpis constant-time (na rozdíl od ===).
  const key = await hmacKey(secret, "verify");
  return crypto.subtle.verify("HMAC", key, sig, enc.encode(`${ts}.${nonce}`));
}

/**
 * Constant-time porovnání dvou řetězců (přihlašovací údaje). Porovnávají se
 * SHA-256 otisky pevné délky — doba běhu nezávisí na tom, kde se hodnoty liší,
 * a nic neprozrazuje ani rozdílná délka vstupů.
 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
