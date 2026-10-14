import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: ["*", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "PerplexityBot", "Googlebot", "Google-Extended", "Applebot-Extended"].map(userAgent => ({ userAgent, allow: "/", disallow: ["/api/"] })),
    sitemap: new URL("/sitemap.xml", siteConfig.url).toString(),
  };
}
