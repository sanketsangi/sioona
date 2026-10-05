import { describe, expect, it } from "vitest";
import {
  buildRevenueLeakReport,
  extractMentionedInr,
  inferCommercial,
  precisionLabel,
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
      incorrect: 1,
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

  it("includes partials in the canonical SignalScore denominator", () => {
    const report = buildRevenueLeakReport({
      signals: [],
      conversations: [],
      messages: [],
      windowLabel: "Last 7 days",
      reviewed: 6,
      correct: 3,
      incorrect: 0,
    });
    expect(report.precision.score).toBe(0.5);
    expect(precisionLabel(report.precision.score, report.precision.reviewed)).toBe(
      "50% (6 reviewed)",
    );
  });

  it("returns zero precision when the window is partial-only", () => {
    const report = buildRevenueLeakReport({
      signals: [],
      conversations: [],
      messages: [],
      windowLabel: "Last 7 days",
      reviewed: 3,
      correct: 0,
      incorrect: 0,
    });
    expect(report.precision.score).toBe(0);
    expect(precisionLabel(report.precision.score, report.precision.reviewed)).toBe(
      "0% (3 reviewed)",
    );
  });
});

it("distinguishes asset context, revenue context and reviewer values", async () => {
  const { commercialValueProvenance } = await import("./revenue-leak");
  expect(commercialValueProvenance("portfolio ₹500000", false)).toBe("Text-derived asset value");
  expect(commercialValueProvenance("brokerage ₹1000", false)).toBe("Text-derived revenue opportunity");
  expect(commercialValueProvenance("portfolio and brokerage ₹500000", false)).toContain("unconfirmed");
  expect(commercialValueProvenance("portfolio ₹500000", true)).toBe("Reviewer-recorded value");
});

it("separates retention asset exposure, revenue opportunity and unconfirmed amounts", () => {
  const signals = [
    signal({ id: "asset", type: "retention", conversationId: "asset", summary: "Portfolio INR 50000" }),
    signal({ id: "duplicate", type: "retention", conversationId: "asset", confidence: .5, summary: "Portfolio INR 50000" }),
    signal({ id: "revenue", type: "retention", conversationId: "revenue", summary: "Subscription INR 1000" }),
    signal({ id: "mixed", type: "retention", conversationId: "mixed", summary: "Portfolio INR 20000 and fees INR 500" }),
    signal({ id: "unspecified", type: "retention", conversationId: "unspecified", summary: "INR 3000" }),
    signal({ id: "recorded", type: "retention", conversationId: "recorded", summary: "Portfolio INR 100000",
      outcome: { outcome: "retained", valueInr: 2000, recordedAt: "2026-10-02" } }),
  ];
  const report = buildRevenueLeakReport({ signals, conversations: [], messages: signals.filter((row) => row.id !== "duplicate").map((row) => ({ id: `m${row.id}`, conversationId: row.conversationId, role: "customer", content: row.summary, timestamp: "2026-10-01" })), windowLabel: "Pilot" });
  expect(report.exposure).toEqual({ assetInr: 50000, revenueOpportunityInr: 1000,
    unconfirmedInr: 23000, reviewerRecordedInr: 2000 });
  expect(report.inrAtRisk).toBe(76000);
  expect(report.inrSaved).toBe(2000);
  expect(report.customersAtRisk.find((row) => row.conversationId === "mixed")?.valueCategory).toBe("unconfirmed");
});

it("never turns generated summaries, agent text or ungrounded evidence into money", () => {
  const row = signal({ id: "s1", type: "retention", summary: "Portfolio INR 1000000, fees INR 5000",
    evidence: ['quote: "portfolio INR 900000"'], mentionedValueInr: 800000 });
  const messages: Message[] = [
    { id: "customer", conversationId: row.conversationId, role: "customer", content: "Subscription INR 1000", timestamp: "2026-10-01" },
    { id: "agent", conversationId: row.conversationId, role: "agent", content: "Portfolio INR 700000", timestamp: "2026-10-01" },
    { id: "other", conversationId: "other", role: "customer", content: "Portfolio INR 600000", timestamp: "2026-10-01" },
  ];
  const report = buildRevenueLeakReport({ signals: [row], conversations: [], messages, windowLabel: "Pilot" });
  expect(report.customersAtRisk[0].valueInr).toBe(1000);
  expect(report.exposure.revenueOpportunityInr).toBe(1000);
  expect(report.exposure.assetInr).toBe(0);
  const missing = buildRevenueLeakReport({ signals: [row], conversations: [], messages: [], windowLabel: "Pilot" });
  expect(missing.customersAtRisk[0].valueInr).toBeNull();
  expect(missing.inrAtRisk).toBe(0);
});

it("binds the amount/category to its customer turn and never joins amount fragments", () => {
  const row = signal({ id: "s1", type: "retention" });
  const message = (id: string, content: string): Message => ({ id, conversationId: row.conversationId,
    role: "customer", content, timestamp: "2026-10-01" });
  const report = buildRevenueLeakReport({ signals: [row], conversations: [], windowLabel: "Pilot",
    messages: [message("asset", "Portfolio INR 50000"), message("fee", "Subscription INR 1000")] });
  expect(report.customersAtRisk[0]).toMatchObject({ valueInr: 50000, valueCategory: "asset", valueMessageIds: ["asset"] });
  const fragments = buildRevenueLeakReport({ signals: [row], conversations: [], windowLabel: "Pilot",
    messages: [message("currency", "Portfolio INR"), message("number", "50000")] });
  expect(fragments.customersAtRisk[0].valueInr).toBeNull();
});

it("uses durable customer amount proof without inventing a missing transcript", () => {
  const row = signal({ id: "s1", type: "retention", mentionedValueInr: 1000,
    commercialValueEvidence: [{ messageId: "source", quote: "INR 1000", amountInr: 1000, category: "asset" }] });
  const report = buildRevenueLeakReport({ signals: [row], conversations: [], messages: [], windowLabel: "Pilot" });
  expect(report.customersAtRisk[0]).toMatchObject({ valueInr: 1000, valueCategory: "asset", valueMessageIds: ["source"], valueProvenance: "Customer-grounded asset value" });
  expect(report.exposure.assetInr).toBe(1000);
});

it("never quotes generated summaries or unsupported evidence as customer speech", () => {
  const row = signal({ id: "s1", type: "retention", summary: "Generated interpretation",
    evidence: ['quote: "Invented customer claim"'] });
  const report = buildRevenueLeakReport({ signals: [row], conversations: [], windowLabel: "Pilot",
    messages: [{ id: "m1", conversationId: row.conversationId, role: "customer", content: "Please close my account", timestamp: "2026-10-01" }] });
  expect(report.customersAtRisk[0].quote).toBe("Please close my account");
  expect(buildRevenueLeakReport({ signals: [row], conversations: [], messages: [], windowLabel: "Pilot" }).customersAtRisk[0].quote).toBe("");
});
