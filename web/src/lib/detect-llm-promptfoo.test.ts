import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { DETECT_LLM_CORPUS_SIGNALS } from "./detect-llm";

const evalDir = path.resolve(__dirname, "../../evals/signal-detect");
const asserts = require(path.join(evalDir, "asserts.js")) as {
  parseOutput: (output: unknown) => {
    signal: string;
    confidence: unknown;
    evidence: string;
  };
  assertIsAllowedSignal: (output: unknown) => { pass: boolean };
  assertEvidenceWhenNotNone: (output: unknown) => { pass: boolean };
  assertConfidenceRange: (output: unknown) => { pass: boolean };
  assertSignalAccuracy: (
    output: unknown,
    context: { vars: { expected_signal: string } }
  ) => { pass: boolean; score?: number };
};

function loadCases(): Array<{
  description: string;
  vars: {
    id: string;
    expected_signal: string;
    messages: Array<{ role: string; content: string }>;
  };
}> {
  const raw = fs.readFileSync(path.join(evalDir, "cases.yaml"), "utf8");
  const blocks = raw.split("\n- description:").slice(1);
  return blocks.map((block) => {
    const description = block.match(/^\s*"([^"]+)"/)?.[1] ?? "";
    const id = block.match(/id:\s*(\S+)/)?.[1] ?? "";
    const expected_signal = block.match(/expected_signal:\s*(\S+)/)?.[1] ?? "";
    const messages = [
      ...block.matchAll(/role:\s*(customer|agent)\n\s+content:\s*(.+)/g),
    ].map((match) => ({
      role: match[1],
      content: match[2].trim(),
    }));
    return { description, vars: { id, expected_signal, messages } };
  });
}

describe("Promptfoo signal-detect dataset", () => {
  const cases = loadCases();

  it("has at least 20 labeled multi-turn chats across all four signals", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    const ids = cases.map((row) => row.vars.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const signal of DETECT_LLM_CORPUS_SIGNALS) {
      expect(
        cases.filter((row) => row.vars.expected_signal === signal).length
      ).toBeGreaterThanOrEqual(5);
    }
    for (const row of cases) {
      expect(row.description).not.toBe("");
      expect(row.vars.messages.length).toBeGreaterThanOrEqual(2);
      expect(
        row.vars.messages.some((message) => message.role === "customer")
      ).toBe(true);
    }
  });
});

describe("Promptfoo signal-detect asserts", () => {
  const goodRetention = JSON.stringify({
    signal: "retention_risk",
    confidence: 0.86,
    evidence: "I am closing my account and moving my portfolio",
    next_action: "Trigger retention playbook",
    reason: "Customer will close and shift the portfolio.",
  });

  it("passes JSON shape, allowed signal, evidence, confidence, and accuracy", () => {
    expect(asserts.assertIsAllowedSignal(goodRetention).pass).toBe(true);
    expect(asserts.assertEvidenceWhenNotNone(goodRetention).pass).toBe(true);
    expect(asserts.assertConfidenceRange(goodRetention).pass).toBe(true);
    expect(
      asserts.assertSignalAccuracy(goodRetention, {
        vars: { expected_signal: "retention_risk" },
      }).pass
    ).toBe(true);
  });

  it("fails a bad signal, empty evidence on a hit, out-of-range confidence, and mismatch", () => {
    expect(
      asserts.assertIsAllowedSignal(
        JSON.stringify({
          signal: "churn",
          confidence: 0.9,
          evidence: "x",
          next_action: "n",
          reason: "r",
        })
      ).pass
    ).toBe(false);
    expect(
      asserts.assertEvidenceWhenNotNone(
        JSON.stringify({
          signal: "lead_intent",
          confidence: 0.8,
          evidence: "   ",
          next_action: "n",
          reason: "r",
        })
      ).pass
    ).toBe(false);
    expect(
      asserts.assertConfidenceRange(
        JSON.stringify({
          signal: "none",
          confidence: 1.4,
          evidence: "",
          next_action: "none",
          reason: "ops",
        })
      ).pass
    ).toBe(false);
    expect(
      asserts.assertSignalAccuracy(goodRetention, {
        vars: { expected_signal: "none" },
      }).pass
    ).toBe(false);
  });

  it("allows empty evidence when signal is none", () => {
    expect(
      asserts.assertEvidenceWhenNotNone(
        JSON.stringify({
          signal: "none",
          confidence: 0.95,
          evidence: "",
          next_action: "none",
          reason: "OTP login.",
        })
      ).pass
    ).toBe(true);
  });
});
