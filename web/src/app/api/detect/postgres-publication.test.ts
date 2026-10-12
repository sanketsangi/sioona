import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendConversation, BackendPredictionWithFeedback } from "@/lib/backend-client";

vi.mock("@/lib/auth-guard", () => ({
  requireApiSession: vi.fn(async () => ({ tenantId: "tenant_demo", role: "admin" })),
}));
vi.mock("@/lib/ai/run-with-ledger", () => ({ runHybridDetectionWithLedger: vi.fn() }));
vi.mock("@/lib/backend-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/backend-client")>(),
  getPilotSettings: vi.fn(),
  getActiveUploads: vi.fn(),
  getConversations: vi.fn(),
  getDetectionResume: vi.fn(),
  getTenantSignalsPage: vi.fn(),
  getSupervisedActionDecisions: vi.fn(),
  publishDetectionRun: vi.fn(),
}));

import * as backend from "@/lib/backend-client";
import * as legacy from "@/lib/sync-predictions";
import { runHybridDetectionWithLedger } from "@/lib/ai/run-with-ledger";
import { readStore } from "@/lib/store";
import { runWithTenant } from "@/lib/tenant-context";
import { POST as detect } from "./route";
import { POST as redetect } from "../store/route";

const conversation: BackendConversation = {
  id: "chat-row", tenant_id: "tenant_demo", conversation_id: "c1",
  channel: "chat", customer_name: null, external_id: null,
  started_at: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  messages: [{ id: "message-row", tenant_id: "tenant_demo", conversation_id: "c1",
    message_id: "m1", role: "customer", content: "Synthetic customer message",
    timestamp: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" }],
};
const oldPrediction: BackendPredictionWithFeedback = {
  id: "old-prediction", tenant_id: "tenant_demo", conversation_id: "c1",
  signal_type: "lead", confidence: 0.9, summary: "Synthetic lead",
  created_at: "2026-10-01T00:00:00Z", active: true, feedback: null,
};
let persisted: BackendPredictionWithFeedback[];
const readCanonical = () => runWithTenant("tenant_demo", () => readStore());
const routes = [
  { name: "detect", invoke: () => detect(new Request("http://localhost/api/detect", { method: "POST" })), failureStatus: 503 },
  { name: "redetect", invoke: () => redetect(new Request("http://localhost/api/store", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "add_taxonomy_override", type: "lead", field: "phrases", value: "synthetic phrase" }),
  })), failureStatus: 400 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SIOONA_STATE_MODE", "postgres");
  vi.stubEnv("SIOONA_TAXONOMY_NEON", "0");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network call")));
  persisted = [structuredClone(oldPrediction)];
  vi.mocked(backend.getPilotSettings).mockResolvedValue(null);
  vi.mocked(backend.getDetectionResume).mockResolvedValue(null);
  vi.mocked(backend.getActiveUploads).mockResolvedValue([]);
  vi.mocked(backend.getConversations).mockResolvedValue([conversation]);
  vi.mocked(backend.getSupervisedActionDecisions).mockResolvedValue([]);
  vi.mocked(backend.getTenantSignalsPage).mockImplementation(async () => ({
    predictions: structuredClone(persisted), next_cursor: null,
  }));
  vi.mocked(runHybridDetectionWithLedger).mockResolvedValue({
    signals: [], llm: { enabled: false, candidates: 1, attempted: 0, added: 0, failed: 0, skipped: 0 },
  });
  vi.spyOn(legacy, "syncPredictionsToBackend");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe.each(routes)("Postgres demo $name publication", ({ invoke, failureStatus }) => {
  it("publishes none as a complete output that stays gone on a fresh canonical read", async () => {
    expect((await readCanonical()).signals).toHaveLength(1);
    vi.mocked(backend.publishDetectionRun).mockImplementation(async (_tenant, runId, inputs) => {
      expect(inputs).toEqual([expect.objectContaining({ conversation_id: "c1", output: [] })]);
      // Emulate the backend's committed complete-output reconciliation.
      persisted = [];
      return { run_id: runId, predictions: [] };
    });
    const response = await invoke();
    expect(response.status).toBe(200);
    expect((await response.json()).signals).toEqual([]);
    expect(backend.publishDetectionRun).toHaveBeenCalledExactlyOnceWith(
      "tenant_demo", expect.any(String), [expect.objectContaining({ conversation_id: "c1", output: [] })],
    );
    expect(legacy.syncPredictionsToBackend).not.toHaveBeenCalled();
    expect((await readCanonical()).signals).toEqual([]);
  });

  it("rejects a publication failure and retains the previous canonical result", async () => {
    vi.mocked(backend.publishDetectionRun).mockRejectedValue(new Error("Commit failed"));
    const response = await invoke();
    expect(response.status).toBe(failureStatus);
    expect((await response.json()).error).toBeTruthy();
    expect(legacy.syncPredictionsToBackend).not.toHaveBeenCalled();
    expect((await readCanonical()).signals).toHaveLength(1);
  });

  it("does not publish failed classification as none", async () => {
    vi.mocked(runHybridDetectionWithLedger).mockResolvedValue({
      signals: [], llm: { enabled: true, candidates: 1, attempted: 1, added: 0, failed: 1, skipped: 0, failedIds: ["c1"] },
    });
    const response = await invoke();
    expect(response.status).toBe(failureStatus);
    expect(backend.publishDetectionRun).not.toHaveBeenCalled();
    expect(legacy.syncPredictionsToBackend).not.toHaveBeenCalled();
    expect((await readCanonical()).signals).toHaveLength(1);
  });
});
