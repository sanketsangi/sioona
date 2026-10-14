import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, howToJsonLd, organizationJsonLd, productJsonLd, productName, serviceJsonLd, siteConfig, websiteJsonLd } from "./site";

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
