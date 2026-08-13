import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendClientError } from "./backend-client";
import type { BackendConversation } from "./backend-client";
import type { BackendPredictionWithFeedback } from "./backend-client";
import {
  applyConversationGroundTruthToSignals,
  applyNeonFeedbackToSignals,
  fetchHydrateConversations,
  mapBackendConversationsToStore,
  tryHydrateStoreFromNeon,
} from "./hydrate-conversations";
import * as backendClient from "./backend-client";
import * as detectLlm from "./detect-llm";
import * as store from "./store";
import * as syncPredictions from "./sync-predictions";
import type { Signal } from "./types";

const NEON_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const MSG_UUID = "11111111-2222-3333-4444-555555555555";

function partnerRow(
  overrides?: Partial<BackendConversation>
): BackendConversation {
  return {
    id: NEON_UUID,
    tenant_id: "tenant_demo",
    conversation_id: "conv_partner_upload_1",
    channel: "whatsapp",
    customer_name: "Priya",
    started_at: "2026-08-01T10:00:00.000Z",
    external_id: "priya_export_1",
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:01:00.000Z",
    messages: [
      {
        id: MSG_UUID,
        tenant_id: "tenant_demo",
        conversation_id: "conv_partner_upload_1",
        message_id: "msg_partner_1",
        role: "customer",
        content: "I want to close my account",
        timestamp: "2026-08-01T10:00:00.000Z",
        created_at: "2026-08-01T10:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

const detectedSignal: Signal = {
  id: "sig_hydrated_1",
  tenantId: "tenant_demo",
  conversationId: "conv_partner_upload_1",
  type: "retention",
  score: 0.9,
  confidence: 0.9,
  summary: "Churn risk",
  suggestedAction: "Offer retention",
  evidence: ["I want to close my account"],
  status: "new",
  createdAt: "2026-08-01T10:00:00.000Z",
};

const neonReviewed: BackendPredictionWithFeedback = {
  id: "pred-hydrated-1",
  tenant_id: "tenant_demo",
  conversation_id: "conv_partner_upload_1",
  signal_type: "retention",
  confidence: 0.9,
  summary: "Churn risk",
  created_at: "2026-08-01T10:00:00.000Z",
  acted: false,
  feedback: {
    id: "fb-hydrated-1",
    tenant_id: "tenant_demo",
    signal_id: "pred-hydrated-1",
    feedback: "correct",
    note: "clear churn",
    reviewed_by: "shadow_reviewer",
    reviewed_at: "2026-08-02T12:00:00.000Z",
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("mapBackendConversationsToStore", () => {
  it("maps conversation_id / message_id to store ids and drops Neon UUIDs", () => {
    const mapped = mapBackendConversationsToStore(
      [partnerRow()],
      "tenant_demo"
    );

    expect(mapped.conversations).toHaveLength(1);
    expect(mapped.conversations[0]).toEqual({
      id: "conv_partner_upload_1",
      tenantId: "tenant_demo",
      channel: "whatsapp",
      customerName: "Priya",
      startedAt: "2026-08-01T10:00:00.000Z",
      externalId: "priya_export_1",
      messageIds: ["msg_partner_1"],
    });
    expect(mapped.conversations[0]).not.toHaveProperty("groundTruth");
    expect(mapped.conversations[0].id).not.toBe(NEON_UUID);

    expect(mapped.messages).toEqual([
      {
        id: "msg_partner_1",
        conversationId: "conv_partner_upload_1",
        role: "customer",
        content: "I want to close my account",
        timestamp: "2026-08-01T10:00:00.000Z",
      },
    ]);
    expect(mapped.messages[0].id).not.toBe(MSG_UUID);
  });

  it("omits null customer_name / external_id and skips invalid roles", () => {
    const mapped = mapBackendConversationsToStore(
      [
        partnerRow({
          customer_name: null,
          external_id: null,
          messages: [
            {
              id: MSG_UUID,
              tenant_id: "tenant_demo",
              conversation_id: "conv_partner_upload_1",
              message_id: "msg_bot",
              role: "bot",
              content: "ignored",
              timestamp: "2026-08-01T10:00:00.000Z",
              created_at: "2026-08-01T10:00:00.000Z",
            },
            {
              id: "22222222-3333-4444-5555-666666666666",
              tenant_id: "tenant_demo",
              conversation_id: "conv_partner_upload_1",
              message_id: "msg_ok",
              role: "agent",
              content: "How can I help?",
              timestamp: "2026-08-01T10:01:00.000Z",
              created_at: "2026-08-01T10:01:00.000Z",
            },
          ],
        }),
      ],
      "tenant_demo"
    );

    expect(mapped.conversations[0]).not.toHaveProperty("customerName");
    expect(mapped.conversations[0]).not.toHaveProperty("externalId");
    expect(mapped.conversations[0].messageIds).toEqual(["msg_ok"]);
    expect(mapped.messages).toHaveLength(1);
    expect(mapped.messages[0].id).toBe("msg_ok");
  });

  it("copies Neon ground_truth onto conversations and never invents when null", () => {
    const labeled = mapBackendConversationsToStore(
      [partnerRow({ ground_truth: "retention" })],
      "tenant_demo"
    );
    expect(labeled.conversations[0].groundTruth).toBe("retention");

    const unlabeled = mapBackendConversationsToStore(
      [partnerRow({ ground_truth: null })],
      "tenant_demo"
    );
    expect(unlabeled.conversations[0]).not.toHaveProperty("groundTruth");

    const invalid = mapBackendConversationsToStore(
      [partnerRow({ ground_truth: "churn" as never })],
      "tenant_demo"
    );
    expect(invalid.conversations[0]).not.toHaveProperty("groundTruth");
  });
});

describe("fetchHydrateConversations", () => {
  it("returns null when Neon has no conversations", async () => {
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([]);
    const writeSpy = vi.spyOn(store, "writeStore");

    await expect(fetchHydrateConversations("tenant_demo")).resolves.toBeNull();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("returns null on 404 / 500 / network errors", async () => {
    const writeSpy = vi.spyOn(store, "writeStore");

    vi.spyOn(backendClient, "getConversations").mockRejectedValue(
      new BackendClientError("not found", 404)
    );
    await expect(fetchHydrateConversations("tenant_demo")).resolves.toBeNull();

    vi.spyOn(backendClient, "getConversations").mockRejectedValue(
      new BackendClientError("database_unavailable", 500)
    );
    await expect(fetchHydrateConversations("tenant_demo")).resolves.toBeNull();

    vi.spyOn(backendClient, "getConversations").mockRejectedValue(
      new BackendClientError("Signal Score backend unreachable: ECONNREFUSED")
    );
    await expect(fetchHydrateConversations("tenant_demo")).resolves.toBeNull();

    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe("applyNeonFeedbackToSignals", () => {
  it("joins by backendSignalId and sets reviewed feedback", () => {
    const joined = applyNeonFeedbackToSignals(
      [{ ...detectedSignal, backendSignalId: "pred-hydrated-1" }],
      [neonReviewed]
    );

    expect(joined[0]?.feedback).toEqual({
      label: "correct",
      note: "clear churn",
      reviewedAt: "2026-08-02T12:00:00.000Z",
    });
    expect(joined[0]?.status).toBe("reviewed");
    expect(joined[0]).not.toHaveProperty("groundTruth");
  });

  it("joins by conversationId + type when backendSignalId is missing", () => {
    const joined = applyNeonFeedbackToSignals([detectedSignal], [neonReviewed]);
    expect(joined[0]?.backendSignalId).toBe("pred-hydrated-1");
    expect(joined[0]?.feedback?.label).toBe("correct");
    expect(joined[0]?.status).toBe("reviewed");
  });

  it("sets acted when Neon acted is true", () => {
    const joined = applyNeonFeedbackToSignals(
      [{ ...detectedSignal, backendSignalId: "pred-hydrated-1" }],
      [{ ...neonReviewed, acted: true }]
    );
    expect(joined[0]?.status).toBe("acted");
    expect(joined[0]?.feedback?.label).toBe("correct");
  });
});

describe("applyConversationGroundTruthToSignals", () => {
  it("copies labeled conversation GT onto matching signals", () => {
    const mapped = mapBackendConversationsToStore(
      [partnerRow({ ground_truth: "retention" })],
      "tenant_demo"
    );
    const joined = applyConversationGroundTruthToSignals(
      [detectedSignal],
      mapped.conversations
    );
    expect(joined[0]?.groundTruth).toBe("retention");
  });

  it("does not invent GT when the conversation is unlabeled", () => {
    const mapped = mapBackendConversationsToStore(
      [partnerRow({ ground_truth: null })],
      "tenant_demo"
    );
    const joined = applyConversationGroundTruthToSignals(
      [detectedSignal],
      mapped.conversations
    );
    expect(joined[0]).not.toHaveProperty("groundTruth");
  });
});

describe("tryHydrateStoreFromNeon", () => {
  it("detects, syncs predictions, and writes store without conversation upsert", async () => {
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([
      partnerRow({ ground_truth: "retention" }),
    ]);
    const upsertSpy = vi.spyOn(backendClient, "upsertConversations");
    vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
      signals: [detectedSignal],
      llm: {
        enabled: false,
        candidates: 0,
        attempted: 0,
        added: 0,
        failed: 0,
        skipped: 0,
      },
    });
    vi.spyOn(syncPredictions, "syncPredictionsToBackend").mockResolvedValue({
      signals: [
        {
          ...detectedSignal,
          backendSignalId: "pred-hydrated-1",
        },
      ],
      sync: {
        attempted: 1,
        created: 1,
        updated: 0,
        failed: 0,
        skipped: 0,
      },
    });
    vi.spyOn(backendClient, "getTenantSignals").mockResolvedValue([]);
    const writeSpy = vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const result = await tryHydrateStoreFromNeon();

    expect(result).not.toBeNull();
    expect(result?.conversations[0].id).toBe("conv_partner_upload_1");
    expect(result?.conversations[0].groundTruth).toBe("retention");
    expect(result?.taxonomyOverrides).toEqual({});
    expect(result?.pilot?.baselineOpportunities).toBe(0);
    expect(result?.signals[0].backendSignalId).toBe("pred-hydrated-1");
    expect(result?.signals[0].groundTruth).toBe("retention");
    expect(result?.signals[0].feedback).toBeUndefined();
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("restores Neon feedback onto JSON signals after prediction sync", async () => {
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([
      partnerRow(),
    ]);
    vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
      signals: [detectedSignal],
      llm: {
        enabled: false,
        candidates: 0,
        attempted: 0,
        added: 0,
        failed: 0,
        skipped: 0,
      },
    });
    vi.spyOn(syncPredictions, "syncPredictionsToBackend").mockResolvedValue({
      signals: [{ ...detectedSignal, backendSignalId: "pred-hydrated-1" }],
      sync: {
        attempted: 1,
        created: 1,
        updated: 0,
        failed: 0,
        skipped: 0,
      },
    });
    vi.spyOn(backendClient, "getTenantSignals").mockResolvedValue([
      { ...neonReviewed, acted: true },
    ]);
    const writeSpy = vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const result = await tryHydrateStoreFromNeon();

    expect(result?.signals[0]?.feedback).toEqual({
      label: "correct",
      note: "clear churn",
      reviewedAt: "2026-08-02T12:00:00.000Z",
    });
    expect(result?.signals[0]?.status).toBe("acted");
    expect(result?.signals[0]).not.toHaveProperty("groundTruth");
    expect(result?.conversations[0]).not.toHaveProperty("groundTruth");
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it("leaves unlabeled Neon chats unlabeled after detect", async () => {
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([
      partnerRow({ ground_truth: null }),
    ]);
    vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
      signals: [detectedSignal],
      llm: {
        enabled: false,
        candidates: 0,
        attempted: 0,
        added: 0,
        failed: 0,
        skipped: 0,
      },
    });
    vi.spyOn(syncPredictions, "syncPredictionsToBackend").mockResolvedValue({
      signals: [{ ...detectedSignal, backendSignalId: "pred-hydrated-1" }],
      sync: {
        attempted: 1,
        created: 1,
        updated: 0,
        failed: 0,
        skipped: 0,
      },
    });
    vi.spyOn(backendClient, "getTenantSignals").mockResolvedValue([]);
    vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const result = await tryHydrateStoreFromNeon();

    expect(result?.conversations[0]).not.toHaveProperty("groundTruth");
    expect(result?.signals[0]).not.toHaveProperty("groundTruth");
  });

  it("still writes chats and signals when feedback GET fails", async () => {
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([
      partnerRow(),
    ]);
    vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
      signals: [detectedSignal],
      llm: {
        enabled: false,
        candidates: 0,
        attempted: 0,
        added: 0,
        failed: 0,
        skipped: 0,
      },
    });
    vi.spyOn(syncPredictions, "syncPredictionsToBackend").mockResolvedValue({
      signals: [{ ...detectedSignal, backendSignalId: "pred-hydrated-1" }],
      sync: {
        attempted: 1,
        created: 1,
        updated: 0,
        failed: 0,
        skipped: 0,
      },
    });
    vi.spyOn(backendClient, "getTenantSignals").mockRejectedValue(
      new BackendClientError("timed out after 10000ms")
    );
    const writeSpy = vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const result = await tryHydrateStoreFromNeon();

    expect(result).not.toBeNull();
    expect(result?.conversations[0].id).toBe("conv_partner_upload_1");
    expect(result?.signals[0].backendSignalId).toBe("pred-hydrated-1");
    expect(result?.signals[0].feedback).toBeUndefined();
    expect(result?.signals[0].status).toBe("new");
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it("still writes chats when detect throws after a successful GET", async () => {
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([
      partnerRow(),
    ]);
    vi.spyOn(detectLlm, "runHybridDetection").mockRejectedValue(
      new Error("detect failed")
    );
    const syncSpy = vi.spyOn(syncPredictions, "syncPredictionsToBackend");
    const writeSpy = vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const result = await tryHydrateStoreFromNeon();

    expect(result).not.toBeNull();
    expect(result?.conversations[0].id).toBe("conv_partner_upload_1");
    expect(result?.messages[0].id).toBe("msg_partner_1");
    expect(result?.signals).toEqual([]);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("returns null without writeStore when Neon is empty", async () => {
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([]);
    const writeSpy = vi.spyOn(store, "writeStore");
    const detectSpy = vi.spyOn(detectLlm, "runHybridDetection");

    await expect(tryHydrateStoreFromNeon()).resolves.toBeNull();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(detectSpy).not.toHaveBeenCalled();
  });
});
