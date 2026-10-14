import type { NextConfig } from "next";

const vary = "Accept, Origin, rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // Prerendered HTML is served without the Node Vary patch, so Accept has to be configured.
    return ["/", "/:path*"].map((source) => ({ source, headers: [{ key: "Vary", value: vary }] }));
  },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: false }];
  },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "framer-motion"],
  },
};

export default nextConfig;
