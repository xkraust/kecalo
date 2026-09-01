// Zahájení přihlášení přes firemní identity provider (etapa D plánu rolí).
import { NextResponse } from "next/server";
import * as client from "openid-client";
import { discoverIdp, oidcConfig, redirectUri } from "@/lib/auth/oidc";
import { OIDC_FLOW_COOKIE, flowCookieOptions, signFlowState } from "@/lib/auth/oidc-flow";
import { config } from "@/lib/config";

export async function GET(request: Request) {
  const cfg = oidcConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Přihlášení přes firemní účet není nastavené." },
      { status: 404 }
    );
  }

  try {
    const idp = await discoverIdp(cfg);

    // state = ochrana proti CSRF na callbacku, nonce = proti replay ID tokenu,
    // PKCE = proti zachycení autorizačního kódu. Všechny tři si musíme
    // zapamatovat do návratu — držíme je v podepsané, httpOnly cookie.
    const state = client.randomState();
    const nonce = client.randomNonce();
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

    const url = client.buildAuthorizationUrl(idp, {
      redirect_uri: redirectUri(request),
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const res = NextResponse.redirect(url.href);
    res.cookies.set(
      OIDC_FLOW_COOKIE,
      await signFlowState({ state, nonce, codeVerifier }, config.sessionSecret),
      flowCookieOptions()
    );
    return res;
  } catch (err) {
    console.error("Zahájení SSO přihlášení selhalo:", err);
    return NextResponse.redirect(
      new URL("/admin/login?error=sso_unavailable", request.url)
    );
  }
}
