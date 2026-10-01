import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EarlyWarning } from "@/lib/early-warning";
import { AtRiskPanel } from "./AtRiskPanel";

function warning(
  id: string,
  customerLabel: string,
  kind: EarlyWarning["kind"] = "repeated_complaint",
): EarlyWarning {
  return {
    id,
    customerLabel,
    conversationIds: [`conv_${id}`],
    kind,
    reason: `${customerLabel} has an open pattern`,
    quote: `${customerLabel} said they are leaving`,
  };
}

describe("AtRiskPanel", () => {
  it("renders nothing when there are no warnings", () => {
    expect(
      renderToStaticMarkup(createElement(AtRiskPanel, { warnings: [] })),
    ).toBe("");
  });

  it("uses the compact metrics card and one truncated line per warning", () => {
    const html = renderToStaticMarkup(
      createElement(AtRiskPanel, {
        warnings: [
          warning("a", "Acme"),
          warning("b", "Beta", "failed_payout"),
          warning("c", "Gamma", "slow_reply"),
          warning("d", "Delta", "unresolved"),
        ],
      }),
    );

    expect(html).toContain('data-slot="card"');
    expect(html).toContain('data-size="sm"');
    expect(html).toContain("shadow-none");
    expect(html).toContain('id="at-risk-heading"');
    expect(html).toContain("At risk");
    expect(html).toContain(">4<");
    expect(html).toContain("Not included in SignalScore.");
    expect(html).toContain("Acme");
    expect(html).toContain("Repeated complaint");
    expect(html).toContain("Beta");
    expect(html).toContain("Failed withdrawal or payout");
    expect(html).toContain("Gamma");
    expect(html).toContain("Slow reply");
    expect(html).not.toContain("Delta");
    expect(html).toContain("1 more");
    expect(html).not.toContain("has an open pattern");
    expect(html).not.toContain("said they are leaving");
  });
});