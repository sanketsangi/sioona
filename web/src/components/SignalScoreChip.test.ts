import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignalScoreChip } from "@/components/SignalScoreChip";

describe("SignalScoreChip", () => {
  it("keeps the stored digits and names rule strength", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreChip, {
        score: 0.9,
        type: "retention",
        evidence: ['phrase: "pause my SIP"'],
      }),
    );

    expect(html).toContain(">90<");
    expect(html).toContain('aria-label="Phrase, rule strength 90"');
    const name = html.match(/aria-label="([^"]+)"/)?.[1] ?? "";
    expect(name).not.toMatch(/probab|confidence|percent|%/i);
  });

  it("names a score with no rule evidence as rule strength", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreChip, { score: 0.91 }),
    );

    expect(html).toContain(">91<");
    expect(html).toContain('aria-label="Rule strength 91"');
    const name = html.match(/aria-label="([^"]+)"/)?.[1] ?? "";
    expect(name).not.toMatch(/probab|confidence|percent|%/i);
  });
});
