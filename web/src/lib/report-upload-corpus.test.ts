import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./backend-client", () => ({ getUploadSnapshot: vi.fn() }));
import { getUploadSnapshot } from "./backend-client";
import { selectUploadCorpus } from "./report-upload-corpus";
import type { StoreData } from "./types";
const store = { tenant: { id: "a" }, conversations: [{ id: "c2" }],
  messages: [{ conversationId: "c2", content: "Replacement" }],
  signals: [{ conversationId: "c2", backendSignalId: "new" }] } as unknown as StoreData;
const snapshot = {
  upload: { tenant_id: "a", upload_id: "u1", status: "completed", source: "old.csv" }, run_id: "old",
  conversations: [{ conversation_id: "c2", channel: "upload", started_at: "2026-10-01T00:00:00Z",
    messages: [{ message_id: "m1", role: "customer", content: "Close my account", timestamp: "2026-10-01T00:00:00Z" }] }],
  detections: [{ conversation_id: "c2", output: [{ signal_type: "retention", evidence: ['quote: "Close my account"'] }] }],
  predictions: [{ id: "old-prediction", tenant_id: "a", conversation_id: "c2", signal_type: "retention",
    confidence: .9, summary: "Leaving", created_at: "2026-10-01T00:00:00Z", feedback: null }],
};
beforeEach(() => vi.mocked(getUploadSnapshot).mockReset().mockResolvedValue(snapshot as never));
it("uses original transcripts and prediction identity instead of mutable cache", async () => {
  const result = await selectUploadCorpus(store, "u1");
  expect(getUploadSnapshot).toHaveBeenCalledWith("a", "u1");
  expect(result.messages[0].content).toBe("Close my account");
  expect(result.signals[0].backendSignalId).toBe("old-prediction");
  expect(result.signals[0].historical).toBe(true);
  expect(result.signals[0].evidence).toEqual(['quote: "Close my account"']);
  expect(result.conversations[0].sourceFile).toBe("old.csv");
});
it("loads a historical corpus absent from the current cache", async () => {
  expect((await selectUploadCorpus({ ...store, conversations: [], messages: [], signals: [] }, "u1")).conversations).toHaveLength(1);
});
it("keeps explicit none outputs empty", async () => {
  vi.mocked(getUploadSnapshot).mockResolvedValue({ ...snapshot,
    detections: [{ conversation_id: "c2", output: [] }], predictions: [] } as never);
  expect((await selectUploadCorpus(store, "u1")).signals).toEqual([]);
});
it("fails closed for malformed, cross-tenant or incomplete snapshots", async () => {
  await expect(selectUploadCorpus(store, "../other")).rejects.toThrow("Invalid upload ID");
  expect(getUploadSnapshot).not.toHaveBeenCalled();
  for (const row of [ { ...snapshot, predictions: [] }, { ...snapshot, detections: [] },
    { ...snapshot, upload: { ...snapshot.upload, tenant_id: "b" } },
    { ...snapshot, predictions: [{ ...snapshot.predictions[0], tenant_id: "b" }] },
    { ...snapshot, conversations: [...snapshot.conversations, ...snapshot.conversations] } ]) {
    vi.mocked(getUploadSnapshot).mockResolvedValue(row as never);
    await expect(selectUploadCorpus(store, "u1")).rejects.toThrow();
  }
});
it("uses the original prediction's reviews and outcomes", async () => {
  vi.mocked(getUploadSnapshot).mockResolvedValue({ ...snapshot, predictions: [{ ...snapshot.predictions[0],
    feedback: { feedback: "correct", note: "Checked", reviewed_at: "2026-10-02T00:00:00Z" },
    outcome: "retained", outcome_value_inr: 1000, outcome_recorded_at: "2026-10-02T00:00:00Z" }] } as never);
  const result = await selectUploadCorpus(store, "u1");
  expect(result.signals[0].feedback?.label).toBe("correct");
  expect(result.signals[0].outcome?.valueInr).toBe(1000);
});

it("permits outcome controls only for explicitly active snapshot predictions", async () => {
  vi.mocked(getUploadSnapshot).mockResolvedValue({ ...snapshot,
    predictions: [{ ...snapshot.predictions[0], active: true }] } as never);
  expect((await selectUploadCorpus(store, "u1")).signals[0].historical).toBe(false);
});
