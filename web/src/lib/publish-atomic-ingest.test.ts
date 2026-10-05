import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./backend-client", () => ({ publishIngestion: vi.fn() }));
import { publishIngestion } from "./backend-client";
import { publishAtomicIngest } from "./publish-atomic-ingest";
const input = { tenantId: "a", source: "synthetic.csv", replace: true,
  conversations: [{ id: "c1", tenantId: "a", channel: "upload", startedAt: "2026-10-01", messageIds: [] }], messages: [], signals: [] };
beforeEach(() => { vi.mocked(publishIngestion).mockReset().mockResolvedValue({ upload_id: "id", status: "completed", active: true, predictions: [] }); });
it("sends corpus, none output and membership in a single deterministic request", async () => {
  await publishAtomicIngest(input);
  await publishAtomicIngest(input);
  const calls = vi.mocked(publishIngestion).mock.calls;
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0][2].detections[0].output).toEqual([]);
  expect(calls[0][2].conversations[0].conversation_id).toBe("c1");
});
it("never publishes incomplete classification", async () => {
  await expect(publishAtomicIngest({ ...input, skippedIds: ["c1"] })).rejects.toThrow("Every conversation");
  await expect(publishAtomicIngest({ ...input, classificationFailed: true })).rejects.toThrow("Every conversation");
  expect(publishIngestion).not.toHaveBeenCalled();
});
it("propagates storage failure without reporting success", async () => {
  vi.mocked(publishIngestion).mockRejectedValue(new Error("unavailable"));
  await expect(publishAtomicIngest(input)).rejects.toThrow("unavailable");
});

it("rejects retired uploads even when they had no signals", async () => {
  vi.mocked(publishIngestion).mockResolvedValue({ upload_id: "old", status: "completed", active: false, predictions: [] });
  await expect(publishAtomicIngest(input)).rejects.toThrow("superseded");
});

it("publishes exact per-file membership with the complete corpus", async () => {
  await publishAtomicIngest({ ...input, conversations: [
    { ...input.conversations[0], sourceFile: "one.csv" },
    { ...input.conversations[0], id: "c2", sourceFile: "two.csv" },
  ] });
  expect(vi.mocked(publishIngestion).mock.calls[0][2].files).toEqual([
    { source: "one.csv", conversation_ids: ["c1"] }, { source: "two.csv", conversation_ids: ["c2"] },
  ]);
});

it("retains none provenance in the durable upload and versions model changes", async () => {
  await publishAtomicIngest({ ...input, contexts: { c1: { model: "m1", promptVersion: "p7" } } });
  await publishAtomicIngest({ ...input, contexts: { c1: { model: "m2", promptVersion: "p7" } } });
  const calls = vi.mocked(publishIngestion).mock.calls;
  expect(calls[0][2].detections[0]).toMatchObject({ output: [], model_version: "m1", prompt_version: "p7" });
  expect(calls[1][2].detections[0].model_version).toBe("m2");
  expect(calls[0][1]).not.toBe(calls[1][1]);
});

it("does not inherit old commercial proof when publication assigns a new revision", async () => {
  vi.mocked(publishIngestion).mockResolvedValue({ upload_id: "u1", status: "completed", active: true,
    predictions: [{ id: "new", conversation_id: "c1", signal_type: "retention", active: true }] });
  const signal = { id: "local", tenantId: "a", conversationId: "c1", type: "retention" as const,
    score: .9, confidence: .9, summary: "Leaving", suggestedAction: "Review", evidence: [],
    status: "new" as const, createdAt: "2026-10-01", backendSignalId: "old", mentionedValueInr: 1000,
    commercialValueEvidence: [{ messageId: "old-message", quote: "INR 1000", amountInr: 1000, category: "asset" as const }] };
  const result = await publishAtomicIngest({ ...input, signals: [signal] });
  expect(result.signals[0].commercialValueEvidence).toBeUndefined();
});
