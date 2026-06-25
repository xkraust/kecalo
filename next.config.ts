import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OTel balíčky nesmí být bundlovány (instrumentation běží v Node.js runtime).
  serverExternalPackages: [
    "@langfuse/otel",
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/api",
  ],
};

export default nextConfig;
