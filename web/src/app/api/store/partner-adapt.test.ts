import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth-guard", () => ({ requireApiSession: vi.fn().mockResolvedValue({ tenantId: "tenant_partner", role: "admin" }) }));
vi.mock("@/lib/store", () => ({ readStore: vi.fn(), addTaxonomyOverride: vi.fn(), writeStore: vi.fn(),
  replaceSignalsPreservingFeedback: vi.fn() }));
vi.mock("@/lib/detect-llm", () => ({ runHybridDetection: vi.fn() }));
vi.mock("@/lib/sync-detection-run", () => ({ syncDetectionRun: vi.fn() }));
vi.mock("@/lib/sync-predictions", () => ({ syncPredictionsToBackend: vi.fn() }));
import { addTaxonomyOverride, writeStore, replaceSignalsPreservingFeedback } from "@/lib/store";
import { runHybridDetection } from "@/lib/detect-llm";
import { syncDetectionRun } from "@/lib/sync-detection-run";
import { syncPredictionsToBackend } from "@/lib/sync-predictions";
import { POST } from "./route";
const store = { tenant: { id: "tenant_partner" }, conversations: [], messages: [], signals: [] };
const request = () => new Request("http://localhost/api/store", { method: "POST",
  body: JSON.stringify({ action: "add_taxonomy_override", type: "lead", field: "phrases", value: "open account" }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addTaxonomyOverride).mockResolvedValue(store as never);
});
it("publishes complete partner output with provenance instead of legacy upsert", async () => {
  const contexts = { c1: { model: "m1", promptVersion: "p1" } };
  vi.mocked(runHybridDetection).mockResolvedValue({ signals: [], llm: { enabled: true, failed: 0,
    skippedIds: ["pending"], contexts } } as never);
  vi.mocked(syncDetectionRun).mockResolvedValue({ signals: [], sync: {} } as never);
  expect((await POST(request())).status).toBe(200);
  expect(syncDetectionRun).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant_partner",
    contexts, skippedIds: ["pending"], priorSignals: store.signals }));
  expect(syncPredictionsToBackend).not.toHaveBeenCalled();
  expect(replaceSignalsPreservingFeedback).not.toHaveBeenCalled();
});
it("records retry IDs without publishing failed partner classification", async () => {
  vi.mocked(runHybridDetection).mockResolvedValue({ signals: [], llm: { enabled: true, failed: 1,
    failedIds: ["failed"], skippedIds: ["pending"] } } as never);
  expect((await POST(request())).status).toBe(400);
  expect(writeStore).toHaveBeenCalledWith({ ...store, llmFailedConversationIds: ["failed"], llmSkippedConversationIds: ["pending"] });
  expect(syncDetectionRun).not.toHaveBeenCalled();
  expect(syncPredictionsToBackend).not.toHaveBeenCalled();
  expect(replaceSignalsPreservingFeedback).not.toHaveBeenCalled();
});
