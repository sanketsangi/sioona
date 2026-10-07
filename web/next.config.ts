import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sentry/profiling-node"],
  // Barrel imports for icon kits / table — avoid compiling unused modules.
  experimental: {
    optimizePackageImports: [
      "@phosphor-icons/react",
      "@shadcn/react",
      "@tanstack/react-table",
      "radix-ui",
      "react-day-picker",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "Document-Policy", value: "js-profiling" }],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG ?? "sioona",
  project: process.env.SENTRY_PROJECT ?? "sioona",
  sentryUrl: process.env.SENTRY_URL ?? "https://de.sentry.io",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  // The guarded E2E build must not emit Sentry's bundler-plugin telemetry.
  telemetry: !process.env.CB02_OUTBOUND_AUDIT,
  // Local / CI builds without SENTRY_AUTH_TOKEN should still succeed.
  errorHandler: (err) => {
    console.warn("[sentry] source map upload skipped:", err.message);
  },
});
