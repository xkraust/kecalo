// Návrat od identity providera (etapa D plánu rolí).
//
// Tady se z ověřených claims stává session Kecala. Od vydání cookie je zbytek
// aplikace na způsobu přihlášení nezávislý — `getSessionUser()`,
// `requireAppRole()` ani `match_chunks` rozdíl mezi lokálním a SSO účtem
// nepoznají. To je hlavní důvod, proč cookie nese jen `uid` a žádné role.
import { NextResponse } from "next/server";
import * as client from "openid-client";
import { config } from "@/lib/config";
import { discoverIdp, extractClaims, oidcConfig, redirectUri } from "@/lib/auth/oidc";
import {
  OIDC_FLOW_COOKIE,
  clearFlowCookie,
  verifyFlowState,
} from "@/lib/auth/oidc-flow";
import { provisionSsoUser } from "@/lib/auth/provision";
import {
  COOKIE_OPTIONS,
  SESSION_COOKIE_NAME,
  createSessionCookie,
} from "@/lib/auth";

function fail(request: Request, reason: string): NextResponse {
  // Detail chyby jde do logu, uživateli stačí obecná hláška na loginu.
  const res = NextResponse.redirect(
    new URL(`/admin/login?error=${reason}`, request.url)
  );
  res.cookies.set(OIDC_FLOW_COOKIE, "", clearFlowCookie());
  return res;
}

export async function GET(request: Request) {
  const cfg = oidcConfig();
  if (!cfg) return fail(request, "sso_disabled");

  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${OIDC_FLOW_COOKIE}=`))
    ?.slice(OIDC_FLOW_COOKIE.length + 1);

  if (!cookie) {
    console.error("SSO callback bez stavové cookie (expirace nebo přímé volání).");
    return fail(request, "sso_state");
  }

  const flow = await verifyFlowState(
    decodeURIComponent(cookie),
    config.sessionSecret
  );
  if (!flow) {
    console.error("SSO callback s neplatnou nebo expirovanou stavovou cookie.");
    return fail(request, "sso_state");
  }

  try {
    const idp = await discoverIdp(cfg);

    // authorizationCodeGrant ověří podpis ID tokenu, issuer, audience,
    // expiraci, `state` i `nonce` — proto se sem předávají očekávané hodnoty.
    const currentUrl = new URL(request.url);
    currentUrl.protocol = new URL(redirectUri(request)).protocol;
    currentUrl.host = new URL(redirectUri(request)).host;

    const tokens = await client.authorizationCodeGrant(idp, currentUrl, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });

    const rawClaims = tokens.claims();
    if (!rawClaims) {
      console.error("SSO callback: ID token neobsahuje claims.");
      return fail(request, "sso_claims");
    }

    const claims = extractClaims(
      rawClaims as unknown as Record<string, unknown>,
      cfg.groupsClaim
    );
    if (!claims.subject || !claims.issuer) {
      console.error("SSO callback: chybí iss nebo sub v claims.");
      return fail(request, "sso_claims");
    }

    const result = await provisionSsoUser(claims);
    if (!result.ok) {
      console.error("SSO provisioning selhal:", result.error);
      return fail(request, "sso_account");
    }

    const res = NextResponse.redirect(new URL("/admin", request.url));
    res.cookies.set(
      SESSION_COOKIE_NAME,
      await createSessionCookie(config.sessionSecret, result.userId),
      COOKIE_OPTIONS
    );
    res.cookies.set(OIDC_FLOW_COOKIE, "", clearFlowCookie());
    return res;
  } catch (err) {
    console.error("SSO callback selhal:", err);
    return fail(request, "sso_failed");
  }
}
