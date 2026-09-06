import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightsShadowTip } from "@/components/InsightsShadowTip";
import { INSIGHTS_SHADOW_TIP_COPY } from "@/lib/insights-shadow-tip";

describe("InsightsShadowTip", () => {
  it("SSR first-paint shows tip copy and dismiss control", () => {
    const html = renderToStaticMarkup(createElement(InsightsShadowTip));

    expect(html).toContain(INSIGHTS_SHADOW_TIP_COPY);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Dismiss Shadow Mode tip"');
    expect(html).toContain('type="button"');
  });
});
