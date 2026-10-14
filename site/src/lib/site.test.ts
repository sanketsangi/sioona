import { describe, expect, it } from "vitest";
import { organizationJsonLd } from "./site";

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
});
