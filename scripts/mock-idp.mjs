#!/usr/bin/env node
/**
 * Minimální OIDC provider pro ověření SSO větve (etapa D plánu rolí) bez
 * firemního tenantu. NENÍ určený k ničemu jinému než k lokálnímu testu:
 * autorizační obrazovku přeskakuje a vydá token komukoli.
 *
 * Implementuje jen to, co `openid-client` při discovery a code grantu potřebuje:
 *   GET  /.well-known/openid-configuration
 *   GET  /authorize   → rovnou redirect zpět na redirect_uri s kódem
 *   POST /token       → ID token podepsaný RS256 (ověřuje PKCE i nonce)
 *   GET  /jwks
 *
 * Použití:
 *   node scripts/mock-idp.mjs                      # port 9090, výchozí uživatel
 *   node scripts/mock-idp.mjs --port=9090 \
 *        --sub=u-1 --email=jan@firma.cz --name="Jan Novák" --groups=Obchod,Pravni
 *
 * Do .env.local pak:
 *   OIDC_ISSUER=http://localhost:9090
 *   OIDC_CLIENT_ID=kecalo-test
 *   OIDC_CLIENT_SECRET=test-secret
 */

import { createServer } from "node:http";
import { generateKeyPairSync, createSign, createHash, randomUUID } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

const PORT = Number(args.port ?? 9090);
const ISSUER = `http://localhost:${PORT}`;
const CLIENT_ID = args.clientId ?? "kecalo-test";
const CLIENT_SECRET = args.clientSecret ?? "test-secret";

const USER = {
  sub: args.sub ?? "user-1",
  email: args.email ?? "jan.novak@firma.cz",
  name: args.name ?? "Jan Novák",
  groups: String(args.groups ?? "Obchod").split(",").map((g) => g.trim()).filter(Boolean),
};

// Klíč se generuje při startu — restart mock IdP znamená nové JWKS, což je
// pro test v pořádku (aplikace si discovery cachuje jen v rámci běhu).
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "mock-key-1";
const jwk = publicKey.export({ format: "jwk" });

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload) {
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createSign("RSA-SHA256").update(data).sign(privateKey).toString("base64url");
  return `${data}.${sig}`;
}

/** code → údaje autorizačního požadavku (jednorázové). */
const codes = new Map();

function send(res, status, body, headers = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(json);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);

  if (url.pathname === "/.well-known/openid-configuration") {
    return send(res, 200, {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "profile", "email"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
      code_challenge_methods_supported: ["S256"],
      claims_supported: ["sub", "iss", "email", "name", "groups"],
    });
  }

  if (url.pathname === "/jwks") {
    return send(res, 200, { keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] });
  }

  if (url.pathname === "/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    if (!redirectUri) return send(res, 400, { error: "invalid_request" });

    const code = randomUUID();
    codes.set(code, {
      nonce: url.searchParams.get("nonce"),
      codeChallenge: url.searchParams.get("code_challenge"),
      redirectUri,
    });

    // Skutečný IdP by tu zobrazil přihlašovací obrazovku; test ji přeskakuje.
    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    if (state) back.searchParams.set("state", state);
    console.log(`  /authorize → redirect zpět s kódem (user ${USER.sub}, groups ${USER.groups.join("|") || "-"})`);
    res.writeHead(302, { Location: back.href });
    return res.end();
  }

  if (url.pathname === "/token" && req.method === "POST") {
    const body = await new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => resolve(new URLSearchParams(raw)));
    });

    // Ověření klienta: basic i post varianta.
    const auth = req.headers.authorization ?? "";
    let clientId = body.get("client_id");
    let clientSecret = body.get("client_secret");
    if (auth.startsWith("Basic ")) {
      const [id, secret] = Buffer.from(auth.slice(6), "base64").toString().split(":");
      clientId = decodeURIComponent(id);
      clientSecret = decodeURIComponent(secret);
    }
    if (clientId !== CLIENT_ID || clientSecret !== CLIENT_SECRET) {
      console.log("  /token → 401 invalid_client");
      return send(res, 401, { error: "invalid_client" });
    }

    const code = body.get("code");
    const entry = codes.get(code);
    if (!entry) {
      console.log("  /token → 400 invalid_grant (neznámý nebo použitý kód)");
      return send(res, 400, { error: "invalid_grant" });
    }
    codes.delete(code); // kód je jednorázový

    // PKCE: S256(verifier) se musí shodovat s challenge z /authorize.
    if (entry.codeChallenge) {
      const verifier = body.get("code_verifier") ?? "";
      const computed = createHash("sha256").update(verifier).digest("base64url");
      if (computed !== entry.codeChallenge) {
        console.log("  /token → 400 invalid_grant (PKCE nesedí)");
        return send(res, 400, { error: "invalid_grant", error_description: "PKCE mismatch" });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const idToken = signJwt({
      iss: ISSUER,
      sub: USER.sub,
      aud: CLIENT_ID,
      exp: now + 300,
      iat: now,
      auth_time: now,
      nonce: entry.nonce ?? undefined,
      email: USER.email,
      email_verified: true,
      name: USER.name,
      groups: USER.groups,
    });

    console.log(`  /token → ID token pro ${USER.email} (groups: ${USER.groups.join(", ") || "žádné"})`);
    return send(res, 200, {
      access_token: randomUUID(),
      token_type: "Bearer",
      expires_in: 300,
      id_token: idToken,
    });
  }

  send(res, 404, { error: "not_found" });
});

server.listen(PORT, () => {
  console.log(`Mock OIDC provider běží na ${ISSUER}`);
  console.log(`  client_id:     ${CLIENT_ID}`);
  console.log(`  client_secret: ${CLIENT_SECRET}`);
  console.log(`  uživatel:      ${USER.email} (sub ${USER.sub})`);
  console.log(`  skupiny:       ${USER.groups.join(", ") || "(žádné)"}`);
  console.log("\nUkonči Ctrl+C.\n");
});
