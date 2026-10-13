import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as backend from "@/lib/backend-client";
import * as storeLib from "@/lib/store";
import { runHybridDetectionWithLedger } from "@/lib/ai/run-with-ledger";
import { acceptLiveChats } from "@/lib/live-ingest/accept";
import { POST } from "./route";

vi.mock("@/lib/auth-guard", () => ({
  requireApiSession: vi.fn(async () => ({ tenantId: "tenant_partner", role: "admin" })),
}));
vi.mock("@/lib/ai/run-with-ledger", () => ({ runHybridDetectionWithLedger: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("SIOONA_STATE_MODE", "postgres");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network call")));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(["file", "live"] as const)("%s ingest preserves pending work outside a failing batch", async (kind) => {
  const store = storeLib.emptyStoreForTenant("tenant_partner");
  store.pilot = { baselineOpportunities: 4, weeklyExportCount: 2, lastUploadedFileName: "previous.csv", updatedAt: "2026-10-13T00:00:00Z" };
  store.llmFailedConversationIds = ["chat_a"];
  store.llmSkippedConversationIds = ["chat_a_skipped"];
  store.detectionResumeUpdatedAt = "2026-10-13T00:00:00Z";
  let saved: backend.BackendDetectionResume = {
    tenant_id: store.tenant.id, failed_conversation_ids: ["chat_a"],
    skipped_conversation_ids: ["chat_a_skipped"], updated_at: store.detectionResumeUpdatedAt,
  };
  vi.spyOn(storeLib, "readStore").mockImplementation(async () => structuredClone(store));
  const cursorRead = vi.spyOn(backend, "getDetectionResume").mockImplementation(async () => structuredClone(saved));
  const cursorWrite = vi.spyOn(backend, "putDetectionResume").mockImplementation(async (_tenant, input) => {
    saved = { ...saved, failed_conversation_ids: input.failed_conversation_ids,
      skipped_conversation_ids: input.skipped_conversation_ids };
    return structuredClone(saved);
  });
  vi.spyOn(backend, "getPublishedConversationIds").mockResolvedValue([]);
  let failedId = "";
  vi.mocked(runHybridDetectionWithLedger).mockImplementation(async (conversations) => {
    failedId = conversations[0].id;
    // A different run updated the durable cursor after this batch's initial read.
    saved.updated_at = "2026-10-13T00:01:00Z";
    return { signals: [], llm: { enabled: true, candidates: 1, attempted: 1,
      added: 0, failed: 1, skipped: 0, failedIds: [failedId], skippedIds: [] } };
  });
  const inputs = [{ externalId: "batch_b", channel: "chat", startedAt: "2026-10-13T00:00:00Z",
    messages: [{ role: "customer" as const, content: "Synthetic message", timestamp: "2026-10-13T00:00:00Z" }] }];
  if (kind === "file") {
    const form = new FormData();
    form.append("file", new File([JSON.stringify({ conversations: inputs })], "batch.csv.json", { type: "application/json" }));
    expect((await POST(new Request("http://localhost/api/ingest", { method: "POST", body: form }))).status).toBe(502);
  } else {
    await expect(acceptLiveChats(inputs, { read: async () => structuredClone(store) }))
      .rejects.toThrow("Every conversation must finish classification");
  }
  expect(failedId).not.toBe("");
  expect(saved.failed_conversation_ids).toEqual(["chat_a", failedId]);
  expect(saved.skipped_conversation_ids).toEqual(["chat_a_skipped"]);
  expect(cursorWrite).toHaveBeenCalledExactlyOnceWith(store.tenant.id, {
    failed_conversation_ids: ["chat_a", failedId], skipped_conversation_ids: ["chat_a_skipped"],
    expected_updated_at: "2026-10-13T00:00:00Z",
  });
  // Supplying the captured version must not re-read and adopt a newer version at save time.
  expect(cursorRead).not.toHaveBeenCalled();
});
