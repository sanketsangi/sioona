import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AnalyticsFeatureStage, EvidenceFeatureStage, ShadowFeatureStage, SignalPillStage } from "./BentoVisuals";

it("renders settled no-JavaScript stages without hiding evidence or starting loops", () => {
  for (const Component of [ShadowFeatureStage, AnalyticsFeatureStage, EvidenceFeatureStage, SignalPillStage]) {
    const html = renderToStaticMarkup(createElement(Component));
    expect(html).toContain('data-motion="false"');
    expect(html).toContain('data-running="false"');
    expect(html).toContain("<noscript>");
    expect(html).not.toContain("feature-playback");
    expect(html).not.toContain("opacity:0");
  }
});
