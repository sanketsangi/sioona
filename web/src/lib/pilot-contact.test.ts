import { expect, it } from "vitest";
import { pilotContactHref } from "./pilot-contact";
it("links only to the configured origin contact form, without workspace data", () => {
  expect(pilotContactHref("https://marketing.example/base?tenant=private#report")).toBe("https://marketing.example/contact");
  expect(pilotContactHref("http://127.0.0.1:3001")).toBe("http://127.0.0.1:3001/contact");
});
it.each(["javascript:alert(1)", "https://user:password@example.com", "http://example.com", "invalid"])("rejects unsafe origin %s", origin => {
  expect(pilotContactHref(origin)).toBe("https://sioona.si/contact");
});
