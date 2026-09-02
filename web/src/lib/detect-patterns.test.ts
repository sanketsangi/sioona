import { describe, expect, it } from "vitest";
import {
  isFraudComplaintText,
  isNegatedMatch,
  matchIntentPatterns,
} from "./detect-patterns";

describe("isFraudComplaintText", () => {
  it("flags phishing, unauthorized, and fake-app complaints", () => {
    expect(
      isFraudComplaintText(
        "someone on whatsapp asked for my otp and said they can add insurance"
      )
    ).toBe(true);
    expect(
      isFraudComplaintText("this is fraud — unauthorized credit line")
    ).toBe(true);
    expect(
      isFraudComplaintText("downloaded a fake apk from telegram")
    ).toBe(true);
  });

  it("does not flag ordinary product asks", () => {
    expect(
      isFraudComplaintText("do you also sell term insurance from the same app?")
    ).toBe(false);
    expect(
      isFraudComplaintText("i want my first fd for 12 months")
    ).toBe(false);
  });
});

describe("isNegatedMatch", () => {
  it("detects never/not immediately before a span", () => {
    const text = "i was never interested in insurance";
    const index = text.indexOf("interested");
    expect(isNegatedMatch(text, index)).toBe(true);
  });

  it("does not flag an unnegated span", () => {
    const text = "i am interested in insurance alongside my wallet";
    const index = text.indexOf("interested");
    expect(isNegatedMatch(text, index)).toBe(false);
  });

  it("does not treat 'not fixed I will leave' as a negated leave phrase", () => {
    const text = "if this is not fixed i will move my money";
    const index = text.indexOf("move my money");
    expect(isNegatedMatch(text, index)).toBe(false);
  });
});

describe("matchIntentPatterns", () => {
  it("fires lead on first-product and opening-own language", () => {
    const hits = matchIntentPatterns(
      "starting fresh — opening my own account, never traded equity",
      "lead"
    );
    expect(hits.map((h) => h.label)).toEqual(
      expect.arrayContaining(["starting-fresh", "opening-own", "never-traded"])
    );
  });

  it("fires retention on stop-using and competitor fill", () => {
    const hits = matchIntentPatterns(
      "human comment today or i stop using this app. if this isn't live i'm filling angel.",
      "retention"
    );
    expect(hits.map((h) => h.label)).toEqual(
      expect.arrayContaining(["stop-using", "filling-competitor"])
    );
  });

  it("fires upsell on family view and same-login adjacent asks", () => {
    const hits = matchIntentPatterns(
      "is there a family view? do you also sell term insurance? same login.",
      "upsell"
    );
    expect(hits.map((h) => h.label)).toEqual(
      expect.arrayContaining(["family-view", "do-you-also", "term-insurance", "same-login"])
    );
  });
});
