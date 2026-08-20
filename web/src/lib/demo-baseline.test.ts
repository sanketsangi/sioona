import { describe, expect, it } from "vitest";
import {
  DEMO_BASELINE_NOTE,
  DEMO_BASELINE_OPPORTUNITIES,
  isColdDemoBaseline,
} from "./demo-baseline";

describe("isColdDemoBaseline", () => {
  it("matches the cold-demo pair and empty note at 4", () => {
    expect(isColdDemoBaseline(DEMO_BASELINE_OPPORTUNITIES, DEMO_BASELINE_NOTE)).toBe(
      true
    );
    expect(isColdDemoBaseline(4, null)).toBe(true);
    expect(isColdDemoBaseline(4, "  ")).toBe(true);
  });

  it("rejects partner baselines", () => {
    expect(isColdDemoBaseline(12, "partner agreed")).toBe(false);
    expect(isColdDemoBaseline(4, "partner agreed")).toBe(false);
    expect(isColdDemoBaseline(12, DEMO_BASELINE_NOTE)).toBe(false);
  });
});
