import { describe, expect, it } from "vitest";
import { getEffectiveTaxonomy, getTaxonomy, SIGNAL_TAXONOMY } from "./taxonomy";

describe("getEffectiveTaxonomy", () => {
  it("returns the base taxonomy when overrides are missing", () => {
    const baseLead = SIGNAL_TAXONOMY.find((entry) => entry.type === "lead");
    expect(baseLead).toBeTruthy();
    expect(getEffectiveTaxonomy()).toEqual(SIGNAL_TAXONOMY);
    expect(getEffectiveTaxonomy(null)).toEqual(SIGNAL_TAXONOMY);
    expect(getTaxonomy("lead").phrases).toEqual(baseLead?.phrases);
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
  });
});
