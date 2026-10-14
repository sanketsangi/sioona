import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";
import { sitemapRevisions } from "@/lib/sitemap-revisions";
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.entries(sitemapRevisions).map(([path, revision]) => ({
    url: new URL(path, siteConfig.url).toString(), ...revision,
    changeFrequency: path === "/" ? "weekly" : "monthly",
  }));
}
