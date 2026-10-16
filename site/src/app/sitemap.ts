import type { MetadataRoute } from "next";
import { routes, siteConfig } from "@/lib/site";
import { sitemapRevisions } from "@/lib/sitemap-revisions";
export default function sitemap(): MetadataRoute.Sitemap {
  return [...routes, "/llms.txt" as const].map(path => ({
    url: new URL(path, siteConfig.url).toString(), ...sitemapRevisions[path],
    changeFrequency: path === "/" ? "weekly" : "monthly",
  }));
}
