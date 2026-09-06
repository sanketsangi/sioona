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

  it("detects no longer / without / wasn't / isn't before a span", () => {
    const noLonger = "i am no longer interested in insurance";
    expect(isNegatedMatch(noLonger, noLonger.indexOf("interested"))).toBe(true);
    const without = "without insurance alongside my wallet";
    expect(isNegatedMatch(without, without.indexOf("insurance"))).toBe(true);
    const wasnt = "i wasn't interested in insurance";
    expect(isNegatedMatch(wasnt, wasnt.indexOf("interested"))).toBe(true);
    const isnt = "she isn't interested in insurance";
    expect(isNegatedMatch(isnt, isnt.indexOf("interested"))).toBe(true);
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

  it("fires other-app / another-venue only with switch intent, not ops mentions", () => {
    expect(
      matchIntentPatterns(
        "i'll switch to another app if this is friday's story too",
        "retention"
      ).map((h) => h.label)
    ).toContain("another-venue");
    expect(
      matchIntentPatterns(
        "how do i stop everything here? i'm taking funds to another app.",
        "retention"
      ).map((h) => h.label)
    ).toEqual(expect.arrayContaining(["stop-everything", "another-venue"]));
    expect(
      matchIntentPatterns(
        "if groww can't hold a mandate i'll apply from the other app dad uses",
        "retention"
      ).map((h) => h.label)
    ).toContain("other-app");
    expect(
      matchIntentPatterns(
        "ca said he'll just use the other broker file if this stays broken",
        "retention"
      ).map((h) => h.label)
    ).toContain("other-app");
    expect(
      matchIntentPatterns(
        "if groww can't match my face i'll finish this at another broker, not proud",
        "retention"
      ).map((h) => h.label)
    ).toContain("another-venue");
    // Verb-asymmetry FNs vs other-app (use/using, prefer)
    expect(
      matchIntentPatterns("i'll use another app", "retention").map(
        (h) => h.label
      )
    ).toContain("another-venue");
    expect(
      matchIntentPatterns("prefer another broker", "retention").map(
        (h) => h.label
      )
    ).toContain("another-venue");
    expect(
      matchIntentPatterns(
        "we're using another platform for a bit",
        "retention"
      ).map((h) => h.label)
    ).toContain("another-venue");
    expect(
      matchIntentPatterns(
        "i'd prefer the other app if kyc stays broken",
        "retention"
      ).map((h) => h.label)
    ).toContain("other-app");
    // Northline-style FPs: micro-deposit / link ops naming another app
    expect(
      matchIntentPatterns(
        "navy federal shows $0.32 and $0.17 from you, plus a $0.01 plaid from another app",
        "retention"
      )
    ).toEqual([]);
    expect(
      matchIntentPatterns(
        "have you linked northline in any other app today?",
        "retention"
      )
    ).toEqual([]);
    expect(
      matchIntentPatterns(
        "did you also have a $0.01 test from another app the same day?",
        "retention"
      )
    ).toEqual([]);
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

  it("fires retention on family-forwarded competitor soft switch", () => {
    const hits = matchIntentPatterns(
      "dad keeps forwarding angel research. if support stays this slow i might just listen to him. that's why dad is winning.",
      "retention"
    );
    expect(hits.map((h) => h.label)).toEqual(
      expect.arrayContaining([
        "family-forwarding-competitor",
        "might-listen-family",
        "family-winning-switch",
      ])
    );
    // Competitor after the family phrase still counts (concatenated later turn)
    expect(
      matchIntentPatterns(
        "web also spins. that's why dad is winning. dad will keep forwarding angel.",
        "retention"
      ).map((h) => h.label)
    ).toContain("family-winning-switch");
    expect(
      matchIntentPatterns(
        "i might just listen to him about angel",
        "retention"
      ).map((h) => h.label)
    ).toContain("might-listen-family");
    // Bare family phrases without a nearby competitor stay none
    expect(matchIntentPatterns("dad is winning", "retention")).toEqual([]);
    expect(
      matchIntentPatterns("i might just listen to him", "retention")
    ).toEqual([]);
    expect(
      matchIntentPatterns(
        "if support stays this slow i might just listen to him",
        "retention"
      )
    ).toEqual([]);
    // Bare competitor research compare stays none (precision gate)
    expect(
      matchIntentPatterns(
        "can you compare the research on angel vs your app?",
        "retention"
      )
    ).toEqual([]);
  });

  it("fires retention on considering-competitor / pause F&O / close broker", () => {
    expect(
      matchIntentPatterns(
        "can't pre-authorise tpin. considering dhan for morning cnc sells.",
        "retention"
      ).map((h) => h.label)
    ).toContain("considering-competitor");
    expect(
      matchIntentPatterns(
        "i'll pause f&o till i get the timings.",
        "retention"
      ).map((h) => h.label)
    ).toContain("pause-trading");
    expect(
      matchIntentPatterns(
        "upstox id is live. closing zerodha this fortnight.",
        "retention"
      ).map((h) => h.label)
    ).toEqual(expect.arrayContaining(["closing-broker"]));
    expect(
      matchIntentPatterns("i'm closing this ticket now", "retention")
    ).toEqual([]);
  });

  it("fires lead on don't-have-broker / open zerodha / first F&O", () => {
    expect(
      matchIntentPatterns(
        "singapore nri. don't have zerodha yet. non-pis nro.",
        "lead"
      ).map((h) => h.label)
    ).toContain("dont-have-broker-yet");
    expect(
      matchIntentPatterns(
        "groww app keeps crashing. can i open zerodha and move later?",
        "lead"
      ).map((h) => h.label)
    ).toContain("open-broker");
    expect(
      matchIntentPatterns(
        "id created this week. first f&o — bank otp income proof?",
        "lead"
      ).map((h) => h.label)
    ).toContain("first-product");
    expect(
      matchIntentPatterns(
        "mother + me + father — three on one demat. online possible?",
        "lead"
      ).map((h) => h.label)
    ).toContain("joint-demat-open");
    expect(
      matchIntentPatterns(
        "kyc finished sunday. want first cnc 5 hdfcbank when funds hit.",
        "lead"
      ).map((h) => h.label)
    ).toContain("first-product");
  });

  it("fires upsell on currency / DDPI / lumpsum / smallcase / SIP bump", () => {
    expect(
      matchIntentPatterns("equity f&o live. add eurinr too?", "upsell").map(
        (h) => h.label
      )
    ).toContain("add-currency-pair");
    expect(
      matchIntentPatterns(
        "gtt sells keep dying. enable ddpi so i skip daily tpin?",
        "upsell"
      ).map((h) => h.label)
    ).toContain("enable-ddpi");
    expect(
      matchIntentPatterns(
        "sip running. want ₹50,000 lumpsum in the same direct index fund today.",
        "upsell"
      ).map((h) => h.label)
    ).toContain("lumpsum-ask");
    expect(
      matchIntentPatterns(
        "already on kite cnc. want a smallcase momentum basket.",
        "upsell"
      ).map((h) => h.label)
    ).toContain("want-smallcase");
    expect(
      matchIntentPatterns(
        "coin sip ₹8,000 running. want ₹12,000 from next month, same fund.",
        "upsell"
      ).map((h) => h.label)
    ).toContain("bump-sip-amount");
    expect(
      matchIntentPatterns(
        "can i pledge coin mf units plus stocks for f&o margin?",
        "upsell"
      ).map((h) => h.label)
    ).toContain("pledge-margin");
    expect(
      matchIntentPatterns(
        "my kite is running. father wants his own id — i'll help kyc.",
        "upsell"
      ).map((h) => h.label)
    ).toContain("family-own-id");
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

  it("does not fire upsell patterns on no-longer second-fund language", () => {
    expect(
      matchIntentPatterns("no longer want a second fund", "upsell")
    ).toEqual([]);
    expect(
      matchIntentPatterns("i am no longer interested in insurance", "upsell")
    ).toEqual([]);
  });
});
