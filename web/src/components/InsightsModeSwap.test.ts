import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightsModeSwap } from "@/components/SignalQueue";

describe("InsightsModeSwap vault switch motion", () => {
  it("SSR list paint has motion off (no vault enter chrome)", () => {
    const html = renderToStaticMarkup(
      createElement(InsightsModeSwap, {
        mode: "list",
        list: createElement("div", null, "queue"),
        review: createElement("div", null, "review"),
      }),
    );
    expect(html).toContain('data-insights-mode="list"');
    expect(html).toContain('data-insights-motion="0"');
    expect(html).toContain("queue");
  });
});
