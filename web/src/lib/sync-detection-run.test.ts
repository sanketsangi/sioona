import { describe, expect, it, vi } from "vitest";
vi.mock("./backend-client", () => ({ publishDetectionRun: vi.fn().mockResolvedValue({ predictions: [] }) }));
import { publishDetectionRun } from "./backend-client";
import { detectionPayload, syncDetectionRun, transcriptContentHash } from "./sync-detection-run";
const chat = { id: "c1", tenantId: "a", channel: "upload", startedAt: "2026-10-01", messageIds: [] };

describe("complete detection publication", () => {
  it("publishes explicit none and stable transcript revision on retries", async () => {
    const input = { tenantId: "a", conversations: [chat], messages: [], signals: [] };
    await syncDetectionRun(input);
    await syncDetectionRun(input);
    const calls = vi.mocked(publishDetectionRun).mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0][2][0].output).toEqual([]);
    expect(transcriptContentHash([])).toBe("4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945");
  });
  it("does not publish skipped conversations as none", async () => {
    vi.mocked(publishDetectionRun).mockClear();
    await syncDetectionRun({ tenantId: "a", conversations: [chat], messages: [], signals: [], skippedIds: ["c1"] });
    expect(publishDetectionRun).not.toHaveBeenCalled();
  });
});

it("keeps the last published state of skipped chats and discards unclassified replacements", async () => {
  const prior = { id: "old", tenantId: "a", conversationId: "c1", type: "lead" as const,
    confidence: .9, score: .9, summary: "Reviewed opening", suggestedAction: "Review", evidence: [],
    status: "reviewed" as const, createdAt: "2026-10-01", backendSignalId: "published-id",
    feedback: { label: "correct" as const, reviewedAt: "2026-10-01" } };
  const result = await syncDetectionRun({ tenantId: "a", conversations: [chat], messages: [],
    signals: [{ ...prior, id: "new", summary: "Unclassified replacement", feedback: undefined }],
    priorSignals: [prior], skippedIds: ["c1"] });
  expect(result.signals).toEqual([prior]);
});

it("includes commercial metadata in the immutable detection output", () => {
  const signal = { conversationId: "c1", type: "lead", confidence: .9, summary: "Opening",
    evidence: ["this week"], urgency: "high", urgencyTimeframe: "this week", mentionedValueInr: 500000 } as import("./types").Signal;
  const output = detectionPayload({ conversations: [chat], messages: [], signals: [signal] })[0].output[0];
  expect(output).toMatchObject({ urgency: "high", urgency_timeframe: "this week", mentioned_value_inr: 500000 });
});

it("publishes explicit none with its actual classifier provenance", async () => {
  vi.mocked(publishDetectionRun).mockClear();
  await syncDetectionRun({ tenantId: "a", conversations: [chat], messages: [], signals: [],
    contexts: { c1: { model: "fallback-model", promptVersion: "prompt-v7" } } });
  expect(vi.mocked(publishDetectionRun).mock.calls[0][2][0]).toMatchObject({
    output: [], model_version: "fallback-model", prompt_version: "prompt-v7" });
});

it("includes transcript coverage for none without inventing missing coverage", () => {
  const base = { conversations: [chat], messages: [], signals: [] };
  const payload = detectionPayload({ ...base, contexts: { c1: {
    model: "m1", promptVersion: "p1", includedTurns: 2, omittedTurns: 7,
    truncated: true, tokenUpperBound: 100, tokenBudget: 2400 } } });
  expect(payload[0].coverage).toEqual({ included_turns: 2, omitted_turns: 7,
    truncated: true, token_upper_bound: 100, token_budget: 2400 });
  expect(detectionPayload(base)[0]).not.toHaveProperty("coverage");
});
