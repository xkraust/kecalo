// Krátkodobý stav OIDC toku mezi redirectem na IdP a návratem na callback
// (etapa D plánu rolí).
//
// Drží se v podepsané httpOnly cookie, ne v paměti serveru: na serverless běží
// start a callback klidně na jiné instanci, takže in-memory mapa by tok
// náhodně rozbíjela. Podpis je stejný HMAC jako u session — bez něj by si
// útočník mohl `state` i `nonce` nastavit sám, čímž by obě ochrany zmizely.
import { createHmac, timingSafeEqual } from "node:crypto";

export const OIDC_FLOW_COOKIE = "oidc_flow";
/** Tok má proběhnout v řádu minut; delší okno jen zvětšuje prostor pro zneužití. */
const MAX_AGE_SECONDS = 600;

export interface OidcFlowState {
  state: string;
  nonce: string;
  codeVerifier: string;
}

interface SignedPayload extends OidcFlowState {
  ts: number;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export async function signFlowState(
  flow: OidcFlowState,
  secret: string
): Promise<string> {
  const payload: SignedPayload = { ...flow, ts: Date.now() };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json, secret)}`;
}

/** Vrátí stav toku, nebo `null` když cookie chybí, je poškozená či expirovaná. */
export async function verifyFlowState(
  value: string,
  secret: string
): Promise<OidcFlowState | null> {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [json, sig] = parts;

  const expected = sign(json, secret);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(json, "base64url").toString("utf8")
    ) as SignedPayload;
    const age = Date.now() - payload.ts;
    if (!(age >= 0) || age > MAX_AGE_SECONDS * 1000) return null;
    if (!payload.state || !payload.nonce || !payload.codeVerifier) return null;
    return {
      state: payload.state,
      nonce: payload.nonce,
      codeVerifier: payload.codeVerifier,
    };
  } catch {
    return null;
  }
}

export function flowCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // `lax` je nutné: IdP se vrací top-level GET redirectem z cizí domény,
    // a při `strict` by se cookie neposlala a tok by vždy selhal.
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

export function clearFlowCookie() {
  return { path: "/", maxAge: 0 };
}
