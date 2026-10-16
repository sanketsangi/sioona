import type { MetadataRoute } from "next";
import { languageAlternates, siteConfig } from "@/lib/site";
import { sitemapRevisions } from "@/lib/sitemap-revisions";
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.entries(sitemapRevisions).map(([path, revision]) => ({
    url: new URL(path, siteConfig.url).toString(), ...revision,
    ...(path !== "/llms.txt" ? { alternates: { languages: languageAlternates(path) } } : {}),
    changeFrequency: path === "/" ? "weekly" : "monthly",
  }));
}
