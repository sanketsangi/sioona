import { describe, expect, it } from "vitest";
import type { BackendPrediction } from "./backend-client";
import {
  quarantineDisplayEvidence,
  suggestedActionFallback,
  withServerEvidence,
} from "./server-evidence";
import type { Signal } from "./types";

const baseSignal: Signal = {
  id: "sig_1",
  tenantId: "tenant_demo",
  conversationId: "conv_1",
  type: "retention",
  score: 0.9,
  confidence: 0.9,
  summary: "Leaving",
  suggestedAction: "Call",
  evidence: ['quote: "local stale quote"'],
  status: "new",
  createdAt: "2026-08-01T00:00:00.000Z",
  backendSignalId: "pred-1",
};

describe("withServerEvidence", () => {
  it("keeps phrase and keyword annotations next to reconstructed quotes", () => {
    const row: BackendPrediction = {
      tenant_id: "tenant_demo",
      conversation_id: "conv_1",
      signal_type: "retention",
      confidence: 0.9,
      summary: "Leaving",
      created_at: "2026-08-01T00:00:00.000Z",
      id: "pred-1",
      evidence_status: "valid",
      evidence_spans: [
        { message_id: "m1", start: 0, end: 28, quote: "Please pause my SIP" },
      ],
    };
    const merged = withServerEvidence(
      {
        ...baseSignal,
        evidence: [
          'quote: "local stale quote"',
          'phrase: "pause my SIP"',
          'keyword: "SIP"',
        ],
      },
      row,
    );
    expect(merged.evidence).toEqual([
      'quote: "Please pause my SIP"',
      'phrase: "pause my SIP"',
      'keyword: "SIP"',
    ]);
    expect(merged.evidenceStatus).toBe("valid");
  });

  it("clears JSON quotes when the backend row omits anchor fields", () => {
    const row: BackendPrediction = {
      tenant_id: "tenant_demo",
      conversation_id: "conv_1",
      signal_type: "retention",
      confidence: 0.9,
      summary: "Leaving",
      created_at: "2026-08-01T00:00:00.000Z",
      id: "pred-1",
    };
    const merged = withServerEvidence(baseSignal, row);
    expect(merged.evidence).toEqual([]);
    expect(merged.evidenceStatus).toBe("unresolved");
  });
});

describe("suggestedActionFallback", () => {
  it("returns empty when stale or unresolved so detect-time prose cannot leak quotes", () => {
    expect(
      suggestedActionFallback({
        suggestedAction: 'Reply about "leaked quote"',
        evidenceStatus: "stale",
      }),
    ).toBe("");
    expect(
      suggestedActionFallback({
        suggestedAction: "Call today",
        evidenceStatus: "unresolved",
      }),
    ).toBe("");
    expect(
      suggestedActionFallback({
        suggestedAction: "Call today",
        evidenceStatus: "valid",
      }),
    ).toBe("Call today");
  });
});

describe("quarantineDisplayEvidence", () => {
  it("clears quotes on JSON-only pending rows", () => {
    const pending = quarantineDisplayEvidence(baseSignal);
    expect(pending.evidence).toEqual([]);
    expect(pending.evidenceStatus).toBe("unresolved");
  });
});
