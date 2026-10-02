import { describe, expect, it } from "vitest";

import { asSignalType, resolveFeedbackSignal } from "./resolve-feedback-signal";
import type { Signal } from "./types";

const base: Signal = {
  id: "sig_conv_a_retention",
  tenantId: "tenant_demo",
  conversationId: "conv_a",
  type: "retention",
  score: 0.9,
  confidence: 0.9,
  summary: "x",
  suggestedAction: "",
  evidence: [],
  status: "new",
  createdAt: "2026-08-01T00:00:00.000Z",
  backendSignalId: "pred-uuid-1",
};

describe("asSignalType", () => {
  it.each(["lead", "retention", "upsell"])("accepts %s", (value) => {
    expect(asSignalType(value)).toBe(value);
  });

  it.each(["", "Lead", "support", 1, null, undefined, {}])(
    "rejects %j",
    (value) => {
      expect(asSignalType(value)).toBeNull();
    },
  );
});

describe("resolveFeedbackSignal", () => {
  it("matches by id first", () => {
    expect(resolveFeedbackSignal([base], base.id, {})?.id).toBe(base.id);
  });

  it("falls back to backendSignalId when URL id drifted", () => {
    expect(
      resolveFeedbackSignal([base], "sig_conv_a_retention_llm", {
        backendSignalId: "pred-uuid-1",
      })?.id,
    ).toBe(base.id);
  });

  it("trims the backendSignalId", () => {
    expect(
      resolveFeedbackSignal([base], "sig_stale", {
        backendSignalId: "  pred-uuid-1 ",
      })?.id,
    ).toBe(base.id);
  });

  it("falls back to conversationId + type", () => {
    expect(
      resolveFeedbackSignal([base], "sig_stale_llm", {
        conversationId: "conv_a",
        type: "retention",
      })?.id,
    ).toBe(base.id);
  });

  it("does not match a conversation with a different type", () => {
    expect(
      resolveFeedbackSignal([base], "sig_stale", {
        conversationId: "conv_a",
        type: "upsell",
      }),
    ).toBeUndefined();
  });

  it("does not match on conversationId alone or an invalid type", () => {
    expect(
      resolveFeedbackSignal([base], "sig_stale", { conversationId: "conv_a" }),
    ).toBeUndefined();
    expect(
      resolveFeedbackSignal([base], "sig_stale", {
        conversationId: "conv_a",
        type: "support",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    expect(resolveFeedbackSignal([base], "sig_none", {})).toBeUndefined();
  });
});
