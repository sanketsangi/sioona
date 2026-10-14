import type { NextConfig } from "next";

import { publicHeaders } from "./src/lib/http-headers";
import { resolveSiteUrl, resolveAppUrl } from "./src/lib/site";
import { contactPolicy } from "./src/lib/contact-policy";

resolveSiteUrl();
resolveAppUrl();
const publishedPolicy = contactPolicy();

const nextConfig: NextConfig = {
  output: "standalone",
  // These three facts are explicitly public. Credentials never enter this snapshot.
  env: { NEXT_PUBLIC_CONTACT_POLICY: JSON.stringify(publishedPolicy) },
  poweredByHeader: false,
  async headers() {
    // Prerendered HTML is served without the Node Vary patch, so Accept has to be configured.
    return ["/", "/:path*"].map((source) => ({ source, headers: Object.entries(publicHeaders).map(([key, value]) => ({ key, value })) }));
  },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: false }];
  },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "framer-motion"],
  },
};

export default nextConfig;
