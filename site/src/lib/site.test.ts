import { afterEach, describe, expect, it, vi } from "vitest";
import { breadcrumbJsonLd, howToJsonLd, organizationJsonLd, productJsonLd, productName, resolveSiteUrl, resolveAppUrl, serviceJsonLd, siteConfig, websiteJsonLd } from "./site";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("sioona.si international production metadata", () => {
  async function productionSite() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sioona.si");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.sioona.si");
    vi.resetModules();
    return import("./site");
  }

  it("accepts the marketing and app origins without weakening production boundaries", () => {
    const env = { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://sioona.si", NEXT_PUBLIC_APP_URL: "https://app.sioona.si" };
    expect(resolveSiteUrl(env)).toBe("https://sioona.si");
    expect(resolveAppUrl(env)).toBe("https://app.sioona.si");
    for (const url of ["http://sioona.si", "https://sioona.si/path", "https://app.sioona.si?tenant=other"]) {
      expect(() => resolveSiteUrl({ ...env, NEXT_PUBLIC_SITE_URL: url })).toThrow();
      expect(() => resolveAppUrl({ ...env, NEXT_PUBLIC_APP_URL: url })).toThrow();
    }
  });

  it("emits route-specific canonicals and four English language alternates", async () => {
    const site = await productionSite();
    for (const path of site.routes) {
      const metadata = site.pageMetadata("Test page", "Test description", path);
      const url = `https://sioona.si${path}`;
      expect(metadata.alternates).toEqual({ canonical: url, languages: { "en-IN": url, "en-US": url, en: url, "x-default": url } });
      expect(metadata.openGraph).toMatchObject({ locale: "en_US", alternateLocale: ["en_IN"], url: path });
    }
  });

  it("declares India and US service areas and organization knowledge topics", async () => {
    const site = await productionSite();
    const countries = [{ "@type": "Country", name: "IN" }, { "@type": "Country", name: "US" }];
    expect(site.organizationJsonLd()).toMatchObject({ areaServed: countries, knowsAbout: ["Signal Intelligence", "Conversation Intelligence"] });
    expect(site.serviceJsonLd()).toMatchObject({ areaServed: countries, provider: { "@id": "https://sioona.si/#organization" } });
    expect(site.organizationJsonLd().address.addressLocality).toBe("Mumbai");
  });

  it("keeps entity IDs and all owned schema URLs on the marketing origin", async () => {
    const site = await productionSite();
    const entities = [site.organizationJsonLd(), site.websiteJsonLd(), site.serviceJsonLd(), site.productJsonLd()];
    for (const entity of entities) expect(entity).toHaveProperty("@id", expect.stringMatching(/^https:\/\/sioona\.si\/#/));
    function check(value: unknown): void {
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (["url", "@id", "item", "termsOfService"].includes(key) && typeof item === "string") expect(new URL(item).origin).toBe("https://sioona.si");
        else check(item);
      }
    }
    for (const value of [...entities, site.howToJsonLd(), site.breadcrumbJsonLd([{ name: "About", path: "/about" }])]) check(value);
    expect(site.siteConfig.appUrl).toBe("https://app.sioona.si");
  });
});

describe("organization JSON-LD", () => {
  it("includes a contact point and an address", () => {
    const data = organizationJsonLd();
    expect(data["@type"]).toBe("Organization");
    expect(data.name).toBe("Sioona Conversation Intelligence");
    expect(data.alternateName).toBe("Sioona");
    expect(data.contactPoint["@type"]).toBe("ContactPoint");
    expect(data.contactPoint.contactType).toBe("sales");
    expect(data.contactPoint.url).toMatch(/\/contact$/);
    expect(data.address["@type"]).toBe("PostalAddress");
    expect(data.address.addressLocality).toBe("Mumbai");
    expect(data.address.addressRegion).toBe("Maharashtra");
    expect(data.address.addressCountry).toBe("IN");
  });

  it("publishes a Service and a homepage breadcrumb", () => {
    const service = serviceJsonLd();
    expect(service["@type"]).toBe("Service");
    expect(service.name).toBe("Sioona Conversation Intelligence");
    expect(service.serviceType).toBe("Conversation intelligence");
    expect(service.offers["@type"]).toBe("Offer");
    expect(service.offers.url).toMatch(/\/pricing$/);
    expect(service.offers).not.toHaveProperty("price");
    const website = websiteJsonLd();
    expect(website["@type"]).toBe("WebSite");
    expect(website.name).toBe(productName);
    expect(website.alternateName).toBe("Sioona");
    expect(website.url).toBe(siteConfig.url.replace(/\/$/, ""));
    expect(website.publisher.name).toBe(productName);
    const crumbs = breadcrumbJsonLd([{ name: "Sioona Conversation Intelligence", path: "/" }]);
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(crumbs.itemListElement).toHaveLength(1);
    expect(crumbs.itemListElement[0].position).toBe(1);
    expect(crumbs.itemListElement[0].item).toMatch(/\/$/);
    const product = productJsonLd();
    expect(product["@type"]).toBe("Product");
    expect(product.name).toBe(productName);
    expect(product.brand.name).toBe("Sioona");
    expect(product).not.toHaveProperty("aggregateRating");
    const howTo = howToJsonLd();
    expect(howTo["@type"]).toBe("HowTo");
    expect(howTo.step.map((step) => step.name)).toEqual(["Connect Chats", "Detect Signals", "Human Review", "Act"]);
    expect(howTo.step.every((step) => step["@type"] === "HowToStep" && step.url.endsWith("/#how"))).toBe(true);
  });
});

describe("production URL boundaries", () => {
  const env = { NODE_ENV: "production" };
  it("uses the stable Render fallback, prefers a custom origin, and rejects temporary hosts", () => {
    expect(() => resolveSiteUrl(env)).toThrow();
    expect(resolveSiteUrl({ ...env, NEXT_PUBLIC_SITE_URL: "https://sioona-site.vercel.app" })).toBe("https://sioona-site.vercel.app");
    expect(resolveSiteUrl({ ...env, RENDER_EXTERNAL_URL: "https://sioona-site.onrender.com" })).toBe("https://sioona-site.onrender.com");
    expect(resolveSiteUrl({ ...env, NEXT_PUBLIC_SITE_URL: "https://www.sioona.com", RENDER_EXTERNAL_URL: "https://sioona-site.onrender.com" })).toBe("https://www.sioona.com");
    expect(() => resolveAppUrl({ ...env, NEXT_PUBLIC_APP_URL: "https://sioona-site.vercel.app" })).toThrow();
    for (const url of ["http://example.com", "https://localhost", "https://localhost.", "https://vercel.app", "https://preview.vercel.app.", "https://127.0.0.1", "https://[::1]", "https://preview.vercel.app", "https://sioona-site.vercel.app.", "https://sioona-site-git-main-sanketsangi-7195s-projects.vercel.app", "https://sioona-site-bw207kycz-sanketsangi-7195s-projects.vercel.app", "https://u:p@example.com", "https://example.com/path", "https://example.com?x=1", "https://example.com#x", "https://example.com?"]) {
      expect(() => resolveSiteUrl({ ...env, NEXT_PUBLIC_SITE_URL: url })).toThrow();
      expect(() => resolveAppUrl({ ...env, NEXT_PUBLIC_APP_URL: url })).toThrow();
    }
    for (const url of ["https://preview.onrender.com", "https://sioona-site.onrender.com/path", "http://sioona-site.onrender.com"]) {
      expect(() => resolveSiteUrl({ ...env, RENDER_EXTERNAL_URL: url })).toThrow();
    }
    expect(resolveSiteUrl({ ...env, NEXT_PUBLIC_SITE_URL: " https://example.com/ " })).toBe("https://example.com");
    expect(resolveAppUrl(env)).toBeNull();
  });
  it("allows local HTTP only for development/test and honors Vercel production", () => {
    expect(resolveSiteUrl({ NODE_ENV: "test" })).toBe("http://localhost:3000");
    expect(resolveSiteUrl({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3001" })).toBe("http://127.0.0.1:3001");
    expect(() => resolveSiteUrl({ NODE_ENV: "development", VERCEL_ENV: "production" })).toThrow();
  });
});
