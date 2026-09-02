import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GeistMaskIcon } from "./GeistMaskIcon";
import {
  GEIST_MASK_SVG,
  geistMaskImage,
  isGeistMaskSrc,
} from "./geist-mask-svg";

describe("geistMaskImage", () => {
  it("inlines every known icon as a data URI (no /icons HTTP)", () => {
    for (const src of Object.keys(GEIST_MASK_SVG)) {
      const value = geistMaskImage(src);
      expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
      expect(value).not.toContain("/icons/");
      expect(isGeistMaskSrc(src)).toBe(true);
    }
  });

  it("returns none for an unknown src instead of a network url", () => {
    expect(geistMaskImage("/icons/missing.svg")).toBe("none");
    expect(geistMaskImage("https://evil.example/x.svg")).toBe("none");
  });

  it("inlines the Vault file icon from public/icons/file.svg", () => {
    expect(isGeistMaskSrc("/icons/file.svg")).toBe(true);
    expect(geistMaskImage("/icons/file.svg")).toContain("M14.5%2013.5V6.5V5.41421");
  });
});

describe("GeistMaskIcon", () => {
  it("paints via an inlined mask, not url(/icons/…)", () => {
    const html = renderToStaticMarkup(
      createElement(GeistMaskIcon, { src: "/icons/lead.svg" })
    );
    expect(html).toContain("data:image/svg+xml");
    expect(html).toContain("bg-current");
    expect(html).not.toContain("url(/icons/");
    expect(html).not.toContain("/icons/lead.svg");
  });
});
