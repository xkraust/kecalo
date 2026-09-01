// Napojení na firemní identity provider (etapa D plánu rolí).
//
// Kecalo si od IdP bere jen identitu a členství ve skupinách. Heslo, MFA, reset
// ani expirace tu nejsou — účet v `users` je STÍN identity, ne kopie účtu
// (`password_hash` zůstává NULL, hlídá to CHECK z migrace 014).
//
// Konfigurace je volitelná: bez `OIDC_ISSUER` se SSO větev vůbec nenabídne
// a přihlášení heslem funguje jako dosud.
import * as client from "openid-client";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Nepovinný název claimu se skupinami; IdP se v něm liší (Entra vs. Keycloak). */
  groupsClaim: string;
}

/** Vrátí konfiguraci z env, nebo `null` když SSO není nastavené. */
export function oidcConfig(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    issuer,
    clientId,
    clientSecret,
    groupsClaim: process.env.OIDC_GROUPS_CLAIM || "groups",
  };
}

export function isOidcEnabled(): boolean {
  return oidcConfig() !== null;
}

/**
 * Discovery konfigurace IdP. Cachuje se v modulu — metadata se mění zřídka
 * a stahovat je při každém přihlášení by přidávalo latenci i bod selhání.
 * Klíčem je issuer, aby změna env v dev režimu nepodstrčila starou hodnotu.
 */
let cached: { key: string; config: client.Configuration } | null = null;

export async function discoverIdp(
  cfg: OidcConfig
): Promise<client.Configuration> {
  const key = `${cfg.issuer}|${cfg.clientId}`;
  if (cached?.key === key) return cached.config;

  const issuerUrl = new URL(cfg.issuer);

  // openid-client v6 správně odmítá HTTP. Výjimku povolujeme JEN pro issuer na
  // localhostu — to je lokální mock IdP (scripts/mock-idp.mjs), kde HTTPS nemá
  // co chránit. Vazba na hostname je záměrná: přepínač v env by se dřív nebo
  // později zapnul v produkci a tiše vypnul ochranu tokenů na cestě.
  const isLocalhost =
    issuerUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(issuerUrl.hostname);

  const config = await client.discovery(
    issuerUrl,
    cfg.clientId,
    cfg.clientSecret,
    undefined,
    isLocalhost ? { execute: [client.allowInsecureRequests] } : undefined
  );
  cached = { key, config };
  return config;
}

/** Redirect URI musí přesně odpovídat tomu, co je zaregistrované u IdP. */
export function redirectUri(request: Request): string {
  const base =
    process.env.OIDC_REDIRECT_BASE_URL ?? new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/api/auth/oidc/callback`;
}

/** Claims, které z ID tokenu skutečně používáme. */
export interface IdpClaims {
  issuer: string;
  subject: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  groups: string[];
}

/**
 * Vytáhne z ověřených claims to, co Kecalo potřebuje.
 *
 * Identita stojí na dvojici (`iss`, `sub`) — **nikdy na e-mailu**: ten se mění
 * (svatba, přejmenování domény) a párování přes něj je klasická cesta
 * k převzetí účtu, když si ho někdo nastaví u jiného vydavatele.
 */
export function extractClaims(
  claims: Record<string, unknown>,
  groupsClaim: string
): IdpClaims {
  const raw = claims[groupsClaim];
  const groups = Array.isArray(raw)
    ? raw.filter((g): g is string => typeof g === "string")
    : typeof raw === "string"
      ? raw.split(/[,\s]+/).filter(Boolean)
      : [];

  const email =
    typeof claims.email === "string" && claims.email ? claims.email : null;

  // Standardní OIDC claims pro rozpad jména; ne každý IdP je posílá, proto
  // fallback rozdělí `name` podle PRVNÍ mezery: „Jan Novák" → Jan / Novák,
  // „Jan van Beek" → Jan / van Beek. U víceslovných příjmení je to správně,
  // u dvou křestních jmen ne — proto jsou v adminu obě pole editovatelná.
  const given =
    typeof claims.given_name === "string" && claims.given_name
      ? claims.given_name
      : null;
  const family =
    typeof claims.family_name === "string" && claims.family_name
      ? claims.family_name
      : null;

  let firstName = given;
  let lastName = family;
  if (!firstName || !lastName) {
    const full =
      typeof claims.name === "string" && claims.name
        ? claims.name.trim()
        : typeof claims.preferred_username === "string"
          ? claims.preferred_username.trim()
          : "";
    const space = full.indexOf(" ");
    if (space > 0) {
      firstName = firstName ?? full.slice(0, space);
      lastName = lastName ?? full.slice(space + 1);
    } else if (full) {
      firstName = firstName ?? full;
    }
  }

  return {
    issuer: String(claims.iss),
    subject: String(claims.sub),
    email,
    firstName,
    lastName,
    groups,
  };
}
