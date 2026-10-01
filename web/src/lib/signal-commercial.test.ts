import { describe, expect, it } from "vitest";
import {
  inferSignalCommercial,
  signalCallRank,
  topCallsToday,
} from "./signal-commercial";
import { shuffleSignals } from "./join-needs-review";
import type { Signal } from "./types";

describe("inferSignalCommercial", () => {
  it("marks a stated exit this week as high and keeps the rupee amount", () => {
    const row = inferSignalCommercial(
      "paisa nikalna hai this week. Portfolio is ₹2,00,000."
    );
    expect(row.urgency).toBe("high");
    expect(row.urgencyTimeframe).toBe("This week");
    expect(row.mentionedValueInr).toBe(200000);
  });

  it("leaves an ops chat as low with no amount", () => {
    const row = inferSignalCommercial("Please send last month's statement PDF.");
    expect(row.urgency).toBe("low");
    expect(row.mentionedValueInr).toBeUndefined();
  });

  it("does not treat the end of a word as a rupee sign", () => {
    expect(inferSignalCommercial("offers 3 plans").mentionedValueInr).toBeUndefined();
    expect(inferSignalCommercial("fees are Rs 500").mentionedValueInr).toBe(500);
  });
});

describe("queue order", () => {
  it("puts higher urgency times value ahead and keeps the hash order otherwise", () => {
    const low: Signal = {
      id: "sig_low",
      tenantId: "tenant_demo",
      conversationId: "c1",
      type: "retention",
      score: 0.9,
      confidence: 0.9,
      summary: "a",
      suggestedAction: "call",
      evidence: [],
      status: "new",
      createdAt: "2026-10-01T00:00:00.000Z",
      urgency: "low",
    };
    const high: Signal = {
      ...low,
      id: "sig_high",
      conversationId: "c2",
      urgency: "high",
      mentionedValueInr: 500000,
    };
    const ordered = shuffleSignals([low, high]);
    expect(ordered.map((row) => row.id)).toEqual(["sig_high", "sig_low"]);
    expect(signalCallRank(high)).toBeGreaterThan(signalCallRank(low));
  });

  it("keeps only the first ten calls", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `s${index}`,
      urgency: "low" as const,
      mentionedValueInr: index,
    }));
    expect(topCallsToday(rows)).toHaveLength(10);
    expect(topCallsToday(rows)[0]?.mentionedValueInr).toBe(11);
  });
});
