import { describe, expect, it } from "vitest";
import { getEffectiveTaxonomy, getTaxonomy, SIGNAL_TAXONOMY } from "./taxonomy";

describe("getEffectiveTaxonomy", () => {
  it("returns the base taxonomy when overrides are missing", () => {
    const baseLead = SIGNAL_TAXONOMY.find((entry) => entry.type === "lead");
    expect(baseLead).toBeTruthy();
    expect(getEffectiveTaxonomy()).toBe(SIGNAL_TAXONOMY);
    expect(getEffectiveTaxonomy(null)).toBe(SIGNAL_TAXONOMY);
    expect(getEffectiveTaxonomy({})).toBe(SIGNAL_TAXONOMY);
    expect(getTaxonomy("lead").phrases).toEqual(baseLead?.phrases);
    expect(getTaxonomy("lead")).toBe(baseLead);
  });

  it("unions override terms onto base without dropping canonical phrases", () => {
    const effective = getEffectiveTaxonomy({
      lead: {
        phrases: ["open zerodha", "Want to open"],
        negativePhrases: ["already sip a", ""],
      },
    });
    const lead = effective.find((entry) => entry.type === "lead");
    expect(lead?.phrases).toEqual(
      expect.arrayContaining(["want to open", "open a demat", "open zerodha"])
    );
    expect(lead?.phrases.filter((p) => p.toLowerCase() === "want to open")).toHaveLength(
      1
    );
    expect(lead?.negativePhrases).toEqual(
      expect.arrayContaining(["already sip a"])
    );
    expect(lead?.negativePhrases).not.toContain("");
    const retention = effective.find((entry) => entry.type === "retention");
    const baseRetention = SIGNAL_TAXONOMY.find((entry) => entry.type === "retention");
    expect(retention).toBe(baseRetention);
  });

  it("merges a single type without rebuilding unused types", () => {
    const adapted = getTaxonomy("lead", {
      lead: { phrases: ["open zerodha"] },
      retention: { phrases: ["closing forever"] },
    });
    expect(adapted.phrases).toEqual(
      expect.arrayContaining(["open a demat", "open zerodha"])
    );
    expect(getTaxonomy("upsell", {
      lead: { phrases: ["open zerodha"] },
    })).toBe(SIGNAL_TAXONOMY.find((entry) => entry.type === "upsell"));
  });

  it("throws on an unknown signal type", () => {
    expect(() => getTaxonomy("other" as "lead")).toThrow(/Unknown signal type/);
  });
});
