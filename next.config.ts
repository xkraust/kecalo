import type { NextConfig } from "next";

// Bezpečnostní hlavičky (oprava SEC-10). Plná CSP (default-src 'self' …) se
// nezavádí — Next.js používá inline skripty (vyžadovalo by nonce/hash) a přínos
// pro app bez raw HTML je malý; frame-ancestors clickjacking pokrývá. HSTS na
// Vercelu dosazuje platforma; při vlastním hostingu doplnit Strict-Transport-Security.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // OTel balíčky nesmí být bundlovány (instrumentation běží v Node.js runtime).
  serverExternalPackages: [
    "@langfuse/otel",
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/api",
  ],
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
