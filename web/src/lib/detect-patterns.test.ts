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

  it("fires lead on want-one-index-etf but not NAV lookup", () => {
    expect(
      matchIntentPatterns(
        "want groww for one index etf, 700 a month",
        "lead"
      ).map((h) => h.label)
    ).toContain("want-etf");
    expect(
      matchIntentPatterns(
        "i want to know why my nifty etf nav looks wrong today",
        "lead"
      )
    ).toEqual([]);
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

  it("fires retention on sitting/I'm on competitor, not research-on-broker", () => {
    expect(
      matchIntentPatterns("i'm sitting on dhan that day", "retention").map(
        (h) => h.label
      )
    ).toContain("on-competitor");
    expect(
      matchIntentPatterns("if thursday pad dies i'm on dhan that open", "retention").map(
        (h) => h.label
      )
    ).toContain("on-competitor");
    expect(
      matchIntentPatterns(
        "can you compare the research on angel vs your app?",
        "retention"
      )
    ).toEqual([]);
    expect(
      matchIntentPatterns("i read a blog on upstox margin, just curious", "retention")
    ).toEqual([]);
  });

  it("does not fire need-closed on ticket/chat ops", () => {
    expect(
      matchIntentPatterns("i need this ticket closed, thanks", "retention")
    ).toEqual([]);
    expect(
      matchIntentPatterns(
        "can i get this chat closed after the screenshot?",
        "retention"
      )
    ).toEqual([]);
    expect(
      matchIntentPatterns(
        "need this resident account closed before i move abroad",
        "retention"
      ).map((h) => h.label)
    ).toContain("need-closed");
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

  it("does not fire upsell patterns on support/ops language", () => {
    expect(
      matchIntentPatterns("same login isn't working on the web app", "upsell")
    ).toEqual([]);
    expect(
      matchIntentPatterns("do you also have weekend support hours?", "upsell")
    ).toEqual([]);
    expect(
      matchIntentPatterns(
        "can i also get last year's capital gains statement?",
        "upsell"
      )
    ).toEqual([]);
    expect(
      matchIntentPatterns(
        "where is my term insurance policy pdf in the app?",
        "upsell"
      )
    ).toEqual([]);
    expect(
      matchIntentPatterns(
        "family view of the ticket — my wife also emailed support",
        "upsell"
      )
    ).toEqual([]);
    expect(
      matchIntentPatterns("turn on mtf is stuck on loading", "upsell")
    ).toEqual([]);
    expect(
      matchIntentPatterns(
        "please increase the timeout, margin calculator keeps failing",
        "upsell"
      )
    ).toEqual([]);
  });
});
