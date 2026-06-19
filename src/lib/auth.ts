export const SESSION_COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE = 86400; // 24h

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionCookie(secret: string): Promise<string> {
  const ts = Date.now().toString();
  const sig = await hmac(secret, ts);
  return `${ts}.${sig}`;
}

export async function verifySession(
  value: string,
  secret: string
): Promise<boolean> {
  const dot = value.indexOf(".");
  if (dot === -1) return false;

  const ts = value.slice(0, dot);
  const sig = value.slice(dot + 1);

  const age = Date.now() - parseInt(ts, 10);
  if (isNaN(age) || age < 0 || age > SESSION_MAX_AGE * 1000) return false;

  const expected = await hmac(secret, ts);
  return sig === expected;
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
