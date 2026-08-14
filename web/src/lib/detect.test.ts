import { describe, expect, it } from "vitest";
import { detectEvalStore as sampleStore } from "@/data/fixtures/detect-eval-fixtures";
import {
  detectSignalsForConversation,
  runDetection,
  scoreType,
  textIncludesTerm,
} from "./detect";
import { computeEvalMetrics } from "./eval";
import type { Conversation, Message } from "./types";

function conv(
  id: string,
  groundTruth: Conversation["groundTruth"],
  customerText: string
): { conversation: Conversation; messages: Message[] } {
  const conversation: Conversation = {
    id,
    tenantId: "tenant_demo",
    channel: "test",
    startedAt: "2026-08-01T00:00:00.000Z",
    messageIds: [`msg_${id}_0`],
    groundTruth,
  };
  const messages: Message[] = [
    {
      id: `msg_${id}_0`,
      conversationId: id,
      role: "customer",
      content: customerText,
      timestamp: conversation.startedAt,
    },
  ];
  return { conversation, messages };
}

describe("textIncludesTerm", () => {
  it("matches phrases as substrings", () => {
    expect(textIncludesTerm("i want to open a demat", "want to open")).toBe(
      true
    );
  });

  it("uses word boundaries for short tokens", () => {
    expect(textIncludesTerm("please leave feedback", "leave")).toBe(true);
    expect(textIncludesTerm("cleaved the trade", "leave")).toBe(false);
  });
});

describe("scoreType", () => {
  it("scores strong lead phrases highly", () => {
    const { score, suppressed } = scoreType(
      "I want to open a demat account. What are your brokerage charges?",
      "lead"
    );
    expect(suppressed).toBe(false);
    expect(score).toBeGreaterThanOrEqual(0.35);
  });

  it("suppresses retention on leave-feedback ops language", () => {
    const { score, suppressed } = scoreType(
      "Can I leave feedback about yesterday's support call?",
      "retention"
    );
    expect(suppressed).toBe(true);
    expect(score).toBe(0);
  });

  it("suppresses upsell on SIP debit date questions", () => {
    const { score, suppressed } = scoreType(
      "When does my SIP get debited each month?",
      "upsell"
    );
    expect(suppressed).toBe(true);
    expect(score).toBe(0);
  });

  it("suppresses lead/upsell on statement fee lookups", () => {
    expect(
      scoreType(
        "What are the AMC fees shown on my mutual fund statement?",
        "lead"
      ).score
    ).toBe(0);
    expect(
      scoreType(
        "What are the AMC fees shown on my mutual fund statement?",
        "upsell"
      ).score
    ).toBe(0);
  });
});

describe("runDetection", () => {
  it("ignores agent messages for matching", () => {
    const conversation: Conversation = {
      id: "conv_agent_only_kw",
      tenantId: "tenant_demo",
      channel: "test",
      startedAt: "2026-08-01T00:00:00.000Z",
      messageIds: ["m0", "m1"],
    };
    const messages: Message[] = [
      {
        id: "m0",
        conversationId: conversation.id,
        role: "customer",
        content: "Thanks",
        timestamp: conversation.startedAt,
      },
      {
        id: "m1",
        conversationId: conversation.id,
        role: "agent",
        content:
          "Want to open a demat account? Interested in premium advisory?",
        timestamp: conversation.startedAt,
      },
    ];
    expect(
      detectSignalsForConversation(conversation, messages, "tenant_demo")
    ).toEqual([]);
  });

  it("keeps labeled fixture precision/recall at 100%", () => {
    const signals = runDetection(
      sampleStore.conversations,
      sampleStore.messages,
      "tenant_demo"
    );
    const metrics = computeEvalMetrics({ ...sampleStore, signals });
    expect(metrics.labeledPrecision).toBe(1);
    expect(metrics.labeledRecall).toBe(1);
    expect(metrics.falsePositives).toBe(0);
    expect(metrics.falseNegatives).toBe(0);
  });

  it("detects each core signal type from clear utterances", () => {
    const cases = [
      conv(
        "c_lead",
        "lead",
        "Can I sign up for a new account? Interested in your pricing."
      ),
      conv(
        "c_lead_expand",
        "lead",
        "Can I upgrade to the pro plan? I need higher limit."
      ),
      conv(
        "c_ret",
        "retention",
        "This is unacceptable. I'm going to switch brokers."
      ),
      conv(
        "c_upsell",
        "upsell",
        "I already trade equity — do you offer a premium advisory plan and loan against shares?"
      ),
    ];
    for (const { conversation, messages } of cases) {
      const signals = detectSignalsForConversation(
        conversation,
        messages,
        "tenant_demo"
      );
      expect(signals.some((s) => s.type === conversation.groundTruth)).toBe(
        true
      );
      expect(signals[0]?.evidence.some((e) => e.startsWith("quote: "))).toBe(
        true
      );
      expect(signals[0]?.summary.length).toBeGreaterThan(20);
      expect(signals[0]?.summary).not.toMatch(/[“”]/);
      expect(signals[0]?.suggestedAction.length).toBeGreaterThan(10);
    }
  });

  it("detects India finance lead / churn / upsell phrasing", () => {
    const cases = [
      conv(
        "c_kyc_lead",
        "lead",
        "First time investor — how do I open a trading account and start my KYC?"
      ),
      conv(
        "c_settle_ret",
        "retention",
        "Settlement is delayed again — if funds aren't credited today I'll raise a closure request."
      ),
      conv(
        "c_fno_upsell",
        "upsell",
        "Existing customer here — can you enable F&O and margin trading facility?"
      ),
    ];
    for (const { conversation, messages } of cases) {
      const signals = detectSignalsForConversation(
        conversation,
        messages,
        "tenant_demo"
      );
      expect(signals.some((s) => s.type === conversation.groundTruth)).toBe(
        true
      );
    }
  });

  it("badges existing-relationship expansion / upgrade as lead, not upsell", () => {
    const cases = [
      "Can I increase my limit on this card?",
      "Please raise my credit limit this quarter.",
      "I want to upgrade to premium and move to the premium plan.",
      "Can I add an add-on card and upgrade my account?",
    ];
    for (const text of cases) {
      const { conversation, messages } = conv("c_expand", "lead", text);
      const signals = detectSignalsForConversation(
        conversation,
        messages,
        "tenant_demo"
      );
      expect(signals.some((s) => s.type === "lead")).toBe(true);
      expect(signals.some((s) => s.type === "upsell")).toBe(false);
    }
  });

  it("keeps genuine adjacent-product cross-sell as upsell", () => {
    const cases = [
      "I already have an account — also interested in insurance alongside my wallet.",
      "I use the wallet for UPI. Looking at insurance and an FD product alongside — how do I add those?",
    ];
    for (const text of cases) {
      const { conversation, messages } = conv("c_cross_sell", "upsell", text);
      const signals = detectSignalsForConversation(
        conversation,
        messages,
        "tenant_demo"
      );
      expect(signals.some((s) => s.type === "upsell")).toBe(true);
      expect(signals.some((s) => s.type === "lead")).toBe(false);
    }
  });

  it("recovers invest-more / top-up upsell true gaps", () => {
    const cases = [
      conv(
        "c_invest_more",
        "upsell",
        "I've been doing a SIP for 2 years. I got a salary hike so I want to invest more — what are my options?"
      ),
      conv(
        "c_topup_loan",
        "upsell",
        "I took a used car loan from you last year. Can I get a top-up or new loan for a Scorpio?"
      ),
    ];
    for (const { conversation, messages } of cases) {
      const signals = detectSignalsForConversation(
        conversation,
        messages,
        "tenant_demo"
      );
      expect(signals.some((s) => s.type === "upsell")).toBe(true);
    }
  });

  it("recovers first-card apply lead true gap", () => {
    const { conversation, messages } = conv(
      "c_first_card",
      "lead",
      "I saw your ad about the zero-fee credit card. I don't have any credit card right now, first time. Can I apply?"
    );
    const signals = detectSignalsForConversation(
      conversation,
      messages,
      "tenant_demo"
    );
    expect(signals.some((s) => s.type === "lead")).toBe(true);
  });

  it("recovers soft churn retention without hard close-my-account", () => {
    const cases = [
      conv(
        "c_shift_portfolio",
        "retention",
        "Groww is much easier. I'm thinking of shifting everything there — if it's not fixed I'm moving my portfolio out."
      ),
      conv(
        "c_deleting",
        "retention",
        "Refund this fee immediately or I'm deleting my account and posting about this."
      ),
      conv(
        "c_closure_process",
        "retention",
        "Send me the account closure process. Your advisory underperformed a free index."
      ),
      conv(
        "c_cancel_card",
        "retention",
        "I barely use this card anymore. Just cancel this card, I don't want it."
      ),
    ];
    for (const { conversation, messages } of cases) {
      const signals = detectSignalsForConversation(
        conversation,
        messages,
        "tenant_demo"
      );
      expect(signals.some((s) => s.type === "retention")).toBe(true);
    }
  });

  it("still ignores soft/ops cases that should not become signals", () => {
    const hardNegatives = [
      "Hello, I want to change my SIP date from 5th to 10th.",
      "Hi, my CA is asking for capital gains statement for ITR filing. Where do I find it in the app?",
      "Hey! Quick question — if I pause my SIP for 2 months, does it affect anything?",
      "Hi, I want to prepay ₹50,000 towards my personal loan this month. Is there any charge?",
      "Quick question, what does XIRR mean in my portfolio?",
    ];
    for (const text of hardNegatives) {
      const { conversation, messages } = conv("c_soft_ops", "none", text);
      const signals = detectSignalsForConversation(
        conversation,
        messages,
        "tenant_demo"
      );
      expect(signals).toEqual([]);
    }
  });

  it("suppresses fintech servicing complaints from becoming leads", () => {
    const cases = [
      "I want a refund for the double charge.",
      "Please block my card — I lost my card.",
      "Report fraud, unauthorized transaction on my account.",
      "When is my loan EMI due? Need the loan statement.",
    ];
    for (const text of cases) {
      const { score, suppressed } = scoreType(text, "lead");
      expect(suppressed).toBe(true);
      expect(score).toBe(0);
    }
  });

  it("suppresses SIP cancel ops language as retention", () => {
    const { score, suppressed } = scoreType(
      "Please cancel my SIP for June only — keep the account open.",
      "retention"
    );
    expect(suppressed).toBe(true);
    expect(score).toBe(0);
  });

  it("fires a previously missed lead when an override phrase is added", () => {
    const { conversation, messages } = conv(
      "c_override_lead",
      "lead",
      "Please unlock the gold onboarding track for my parents."
    );
    expect(
      detectSignalsForConversation(conversation, messages, "tenant_demo")
    ).toEqual([]);
    const signals = detectSignalsForConversation(
      conversation,
      messages,
      "tenant_demo",
      { lead: { phrases: ["gold onboarding track"] } }
    );
    expect(signals.some((s) => s.type === "lead")).toBe(true);
  });

  it("suppresses a false positive when an override negative is added", () => {
    const text =
      "I want to open a demat account but only need the marketing flyer.";
    expect(scoreType(text, "lead").score).toBeGreaterThanOrEqual(0.35);
    const { score, suppressed } = scoreType(text, "lead", {
      lead: { negativePhrases: ["marketing flyer"] },
    });
    expect(suppressed).toBe(true);
    expect(score).toBe(0);
  });

  it("does not fire lead/upsell on vague support asks", () => {
    const hardNegatives = [
      "Do you offer 24x7 chat support?",
      "Looking for more help with this ticket.",
      "Please stop the marketing emails.",
    ];
    for (const text of hardNegatives) {
      const { conversation, messages } = conv("c_hard_neg", "none", text);
      const signals = detectSignalsForConversation(
        conversation,
        messages,
        "tenant_demo"
      );
      expect(signals).toEqual([]);
    }
  });

  it("does not fire retention on soft competitor mention without leave intent", () => {
    const { conversation, messages } = conv(
      "c_soft_comp",
      "none",
      "I saw your competitor has a nicer UI, just FYI."
    );
    const signals = detectSignalsForConversation(
      conversation,
      messages,
      "tenant_demo"
    );
    expect(signals).toEqual([]);
  });

  it("fires retention on refund frustration phrases", () => {
    const { conversation, messages } = conv(
      "c_refund_ret",
      "retention",
      "Still waiting for my refund, very frustrated."
    );
    const signals = detectSignalsForConversation(
      conversation,
      messages,
      "tenant_demo"
    );
    expect(signals.some((s) => s.type === "retention")).toBe(true);
  });

  it("treats outbound holdings transfer as retention, not lead", () => {
    const { conversation, messages } = conv(
      "c_holdings_out",
      "retention",
      "I want to close my demat and transfer my holdings out."
    );
    const signals = detectSignalsForConversation(
      conversation,
      messages,
      "tenant_demo"
    );
    expect(signals.some((s) => s.type === "retention")).toBe(true);
    expect(signals.some((s) => s.type === "lead")).toBe(false);
  });

  it("requires keyword co-evidence when no phrase matched", () => {
    expect(scoreType("My wallet balance looks fine.", "lead").score).toBe(0);
    expect(scoreType("UPI is working again.", "lead").score).toBe(0);
  });

});
