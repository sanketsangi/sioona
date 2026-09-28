import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import evidenceWhenSignaled from "./evidence";
import expectedSignal from "./signal";

const valid = {
  signal: "retention_risk",
  confidence: 0.86,
  evidence: "I am closing my account and moving my portfolio",
  next_action: "Trigger retention playbook",
  reason: "Customer will close and shift the portfolio.",
};

describe("signal accuracy assertion", () => {
  it("passes when the labeled signal matches", () => {
    expect(
      expectedSignal(JSON.stringify(valid), {
        vars: { expected_signal: "retention_risk" },
      }).pass
    ).toBe(true);
  });

  it("fails when the labeled signal differs", () => {
    const result = expectedSignal(JSON.stringify(valid), {
      vars: { expected_signal: "none" },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("retention_risk");
  });

  it("fails when the output is not JSON", () => {
    expect(
      expectedSignal("not json", { vars: { expected_signal: "none" } }).pass
    ).toBe(false);
  });
});

describe("evidence assertion", () => {
  it("requires evidence when the signal is not none", () => {
    expect(evidenceWhenSignaled(JSON.stringify(valid)).pass).toBe(true);
    const empty = { ...valid, evidence: "  " };
    expect(evidenceWhenSignaled(JSON.stringify(empty)).pass).toBe(false);
  });

  it("allows empty evidence when the signal is none", () => {
    expect(
      evidenceWhenSignaled(
        JSON.stringify({ ...valid, signal: "none", evidence: "" })
      ).pass
    ).toBe(true);
  });
});

describe("dataset", () => {
  const text = readFileSync(
    path.join(import.meta.dirname, "../dataset.yaml"),
    "utf8"
  );
  const labels = [
    ...text.matchAll(
      /^    expected_signal: (retention_risk|upsell_opportunity|lead_intent|none)$/gm
    ),
  ].map((match) => match[1]);

  it("has at least 15 multi-turn cases covering every label", () => {
    expect(labels.length).toBeGreaterThanOrEqual(15);
    expect(text.match(/^- description:/gm)?.length).toBe(labels.length);
    for (const signal of [
      "retention_risk",
      "upsell_opportunity",
      "lead_intent",
      "none",
    ]) {
      expect(labels.filter((label) => label === signal).length).toBeGreaterThanOrEqual(
        4
      );
    }
    expect(text.match(/role: customer/g)?.length).toBeGreaterThanOrEqual(
      labels.length
    );
    expect(text.match(/role: agent/g)?.length).toBeGreaterThanOrEqual(
      labels.length
    );
  });
});
