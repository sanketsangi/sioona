import { describe, expect, it } from "vitest";
import {
  buildRevenueLeakReport,
  extractMentionedInr,
  inferCommercial,
  pseudonymFor,
} from "./revenue-leak";
import type { Conversation, Message, Signal } from "./types";

function signal(partial: Partial<Signal> & Pick<Signal, "id" | "type">): Signal {
  return {
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    score: 0.8,
    confidence: 0.8,
    summary: "Customer may leave",
    suggestedAction: "Call today",
    evidence: ["I am closing my account today"],
    status: "new",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

describe("extractMentionedInr", () => {
  it("reads rupee, lakh, and crore amounts", () => {
    expect(extractMentionedInr("Please move ₹1,50,000 today")).toBe(150000);
    expect(extractMentionedInr("portfolio is 2.5 lakh")).toBe(250000);
    expect(extractMentionedInr("about 1.2 crore sitting here")).toBe(12000000);
  });

  it("returns null when the customer stated no amount", () => {
    expect(extractMentionedInr("I want to close my account")).toBeNull();
  });
});

describe("inferCommercial", () => {
  it("marks a same-week exit as high urgency", () => {
    const row = inferCommercial("paisa nikalna hai this week, Zerodha pe shift");
    expect(row.urgency).toBe("high");
    expect(row.timeframe).toBe("This week");
  });

  it("marks a vague complaint as medium", () => {
    const row = inferCommercial("not happy with delays on my payout");
    expect(row.urgency).toBe("medium");
  });
});

describe("buildRevenueLeakReport", () => {
  const conversations: Conversation[] = [
    {
      id: "conv_1",
      tenantId: "tenant_demo",
      channel: "whatsapp",
      customerName: "Rohan Kapoor",
      startedAt: "2026-10-01T00:00:00.000Z",
      messageIds: ["m1"],
    },
  ];
  const messages: Message[] = [
    {
      id: "m1",
      conversationId: "conv_1",
      role: "customer",
      content: "If this isn't fixed today I'm closing. Portfolio is ₹2,00,000.",
      timestamp: "2026-10-01T00:00:00.000Z",
    },
  ];

  it("anonymises by default and totals rupees at risk", () => {
    const report = buildRevenueLeakReport({
      signals: [
        signal({
          id: "sig_1",
          type: "retention",
          evidence: ["Portfolio is ₹2,00,000. closing today"],
        }),
        signal({
          id: "sig_2",
          type: "lead",
          conversationId: "conv_2",
          evidence: ["I want to open a demat"],
        }),
      ],
      conversations,
      messages,
      windowLabel: "Last 7 days",
      reviewed: 5,
      correct: 4,
    });
    expect(report.anonymised).toBe(true);
    expect(report.customersAtRisk[0]?.customerLabel).toBe(pseudonymFor("conv_1"));
    expect(report.customersAtRisk[0]?.customerLabel).not.toContain("Rohan");
    expect(report.counts).toEqual({ retention: 1, lead: 1, upsell: 0 });
    expect(report.inrAtRisk).toBe(200000);
    expect(report.inrSaved).toBe(0);
    expect(report.precision.score).toBeCloseTo(0.8);
  });

  it("counts a retained customer in both rupees at risk and rupees saved", () => {
    const report = buildRevenueLeakReport({
      signals: [
        signal({
          id: "sig_1",
          type: "retention",
          evidence: ["Portfolio is ₹2,00,000"],
          outcome: {
            outcome: "retained",
            valueInr: 200000,
            recordedAt: "2026-10-01T01:00:00.000Z",
          },
        }),
      ],
      conversations,
      messages,
      windowLabel: "Last 7 days",
      anonymised: false,
    });
    expect(report.customersAtRisk[0]?.customerLabel).toBe("Rohan Kapoor");
    expect(report.customersAtRisk[0]?.outcome).toBe("saved");
    expect(report.inrAtRisk).toBe(200000);
    expect(report.inrSaved).toBe(200000);
    expect(report.outcomes.saved).toBe(1);
  });
});
