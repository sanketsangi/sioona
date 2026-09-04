import { describe, expect, it } from "vitest";
import {
  DEMO_BASELINE_NOTE,
  DEMO_BASELINE_OPPORTUNITIES,
  isColdDemoBaseline,
  isPartnerBaseline,
  isUnsetOrColdDemoBaseline,
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

describe("isPartnerBaseline / isUnsetOrColdDemoBaseline", () => {
  it("treats agreed counts and notes as partner", () => {
    expect(isPartnerBaseline(12, "partner agreed")).toBe(true);
    expect(isPartnerBaseline(4, "partner agreed")).toBe(true);
    expect(isPartnerBaseline(0, "agreed zero")).toBe(true);
  });

  it("treats cold-demo and bare zero as unset", () => {
    expect(isUnsetOrColdDemoBaseline(4, DEMO_BASELINE_NOTE)).toBe(true);
    expect(isUnsetOrColdDemoBaseline(0, null)).toBe(true);
    expect(isPartnerBaseline(0, null)).toBe(false);
    expect(isPartnerBaseline(4, null)).toBe(false);
  });
});
