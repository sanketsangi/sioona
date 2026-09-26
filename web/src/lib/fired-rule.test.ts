import { describe, expect, it } from "vitest";
import {
  firedRuleKind,
  firedRuleSentence,
  scoreChipAccessibleName,
} from "./fired-rule";

describe("firedRuleKind", () => {
  it("reads a lexicon phrase, two keywords, and a structural span", () => {
    expect(
      firedRuleKind(['phrase: "pause my SIP"'], "retention"),
    ).toBe("phrase");
    expect(firedRuleSentence("phrase")).toBe("Hit was a phrase.");

    expect(
      firedRuleKind(
        ['keyword: "demat"', 'keyword: "trading"'],
        "lead",
      ),
    ).toBe("keywords");
    expect(firedRuleSentence("keywords")).toBe("Hit was two keywords.");

    expect(
      firedRuleKind(['phrase: "starting fresh"'], "lead"),
    ).toBe("pattern");
    expect(firedRuleSentence("pattern")).toBe(
      "Hit was a structural pattern.",
    );
  });

  it("keeps a non-pattern phrase label and ignores a single keyword", () => {
    expect(firedRuleKind(['phrase: "prior tickets"'], "retention")).toBe(
      "phrase",
    );
    expect(firedRuleKind(['keyword: "demat"'], "lead")).toBeNull();
  });
});

describe("scoreChipAccessibleName", () => {
  it("names rule strength and not a model probability", () => {
    expect(
      scoreChipAccessibleName(0.9, ['phrase: "pause my SIP"'], "retention"),
    ).toBe("Phrase, rule strength 90");
    expect(
      scoreChipAccessibleName(
        0.35,
        ['keyword: "demat"', 'keyword: "trading"'],
        "lead",
      ),
    ).toBe("Two keywords, rule strength 35");
    expect(
      scoreChipAccessibleName(0.42, ['phrase: "starting fresh"'], "lead"),
    ).toBe("Structural pattern, rule strength 42");
    expect(scoreChipAccessibleName(0.91)).toBe("Rule strength 91");

    for (const name of [
      scoreChipAccessibleName(0.9, ['phrase: "pause my SIP"'], "retention"),
      scoreChipAccessibleName(0.35, ['keyword: "demat"', 'keyword: "trading"'], "lead"),
      scoreChipAccessibleName(0.42, ['phrase: "starting fresh"'], "lead"),
      scoreChipAccessibleName(0.91),
    ]) {
      expect(name).not.toMatch(/probab|confidence|percent|%/i);
    }
  });
});
