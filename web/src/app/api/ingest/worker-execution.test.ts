import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth-guard", () => ({ requireApiSession: vi.fn(async () => ({ tenantId: "tenant_partner", role: "admin" })) }));
vi.mock("@/lib/ai/run-with-ledger", () => ({ runHybridDetectionWithLedger: vi.fn() }));
vi.mock("@/lib/enqueue-detection", () => ({ enqueueCanonicalUpload: vi.fn(), enqueueCanonicalDetect: vi.fn() }));
import { runHybridDetectionWithLedger } from "@/lib/ai/run-with-ledger";
import { enqueueCanonicalUpload, enqueueCanonicalDetect } from "@/lib/enqueue-detection";
import * as storeLib from "@/lib/store";
import * as backend from "@/lib/backend-client";
import { POST as ingest } from "./route";
import { POST as detect } from "../detect/route";
import { acceptLiveChats } from "@/lib/live-ingest/accept";
const job = { job_id: "j1", upload_id: "u1", status: "queued" as const, attempt_count: 0, max_attempts: 3, completed_conversations: 0, conversation_count: 1, last_error_category: null };
const inputs = [{ externalId: "synthetic", channel: "chat", startedAt: "2026-10-14T00:00:00Z", messages: [{ role: "customer" as const, content: "I want to open an account", timestamp: "2026-10-14T00:00:00Z" }] }];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SIOONA_STATE_MODE", "postgres"); vi.stubEnv("SIOONA_DETECTION_EXECUTION", "worker");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network")));
  const store = storeLib.emptyStoreForTenant("tenant_partner");
  vi.spyOn(storeLib, "readStore").mockImplementation(async () => structuredClone(store));
  vi.spyOn(backend, "getPilotSettings").mockResolvedValue(null);
  vi.spyOn(backend, "getDetectionResume").mockResolvedValue(null);
  vi.spyOn(backend, "getTaxonomyOverrides").mockResolvedValue({});
  vi.spyOn(backend, "getPublishedConversationIds").mockResolvedValue([]);
  vi.mocked(enqueueCanonicalUpload).mockResolvedValue(job);
  vi.mocked(enqueueCanonicalDetect).mockResolvedValue(job);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("upload returns a job without inline detection or client counter mutation", async () => {
  const form = new FormData(); form.append("file", new File([JSON.stringify({ conversations: inputs })], "synthetic.json", { type: "application/json" }));
  const response = await ingest(new Request("http://localhost/api/ingest", { method: "POST", body: form }));
  expect(response.status).toBe(202); expect((await response.json()).job_id).toBe("j1");
  expect(enqueueCanonicalUpload).toHaveBeenCalled(); expect(runHybridDetectionWithLedger).not.toHaveBeenCalled();
});
it("detect returns backend job status and never invokes the inline classifier", async () => {
  const response = await detect(new Request("http://localhost/api/detect", { method: "POST" }));
  expect(response.status).toBe(202); expect((await response.json()).status).toBe("queued");
  expect(enqueueCanonicalDetect).toHaveBeenCalled(); expect(runHybridDetectionWithLedger).not.toHaveBeenCalled();
});
it("live intake queues canonical work without a provider call", async () => {
  const result = await acceptLiveChats(inputs);
  expect(result).toEqual({ accepted: 1, job }); expect(runHybridDetectionWithLedger).not.toHaveBeenCalled();
});
