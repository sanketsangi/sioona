import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "@/data/fixtures/partner-export-overrides";
import { BackendClientError } from "./backend-client";
import type { BackendConversation } from "./backend-client";
import type { BackendPredictionWithFeedback } from "./backend-client";
import { runDetection } from "./detect";
import {
  applyConversationGroundTruthToSignals,
  applyNeonFeedbackToSignals,
  fetchHydrateConversations,
  fetchOverlayConversations,
  filterConversationsForLivePartner,
  filterHydratedChats,
  mapBackendConversationsToStore,
  mergeOverlayChats,
  tryHydrateStoreFromNeon,
} from "./hydrate-conversations";
import * as backendClient from "./backend-client";
import * as detectLlm from "./detect-llm";
import * as store from "./store";
import * as syncPredictions from "./sync-predictions";
import type { Signal, TaxonomyOverrides } from "./types";

const NEON_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const MSG_UUID = "11111111-2222-3333-4444-555555555555";
const ADAPT_CHAT_CONTENT =
  "Portfolio review please. I am already doing SIPs. Yes, send the link. I want to open/start this week.";

function expectAdaptOverrides(overrides: TaxonomyOverrides | undefined) {
  expect(overrides?.lead?.negativePhrases).toEqual(
    expect.arrayContaining([
      "portfolio review",
      "already doing sip",
      "move my money",
    ])
  );
  expect(overrides?.upsell?.phrases).toEqual(
    expect.arrayContaining([
      "portfolio review",
      "already doing sip",
      "increase investment",
      "where do i even start",
    ])
  );
}

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

  it("replaces a stale JSON backendSignalId when joining by conversation+type", () => {
    const joined = applyNeonFeedbackToSignals(
      [{ ...detectedSignal, backendSignalId: "stale-uuid-gone" }],
      [neonReviewed]
    );
    expect(joined[0]?.backendSignalId).toBe("pred-hydrated-1");
    expect(joined[0]?.feedback?.label).toBe("correct");
  });

  it("copies backendSignalId from unreviewed Neon rows without inventing feedback", () => {
    const joined = applyNeonFeedbackToSignals(
      [detectedSignal],
      [{ ...neonReviewed, feedback: null }]
    );
    expect(joined[0]?.backendSignalId).toBe("pred-hydrated-1");
    expect(joined[0]?.feedback).toBeUndefined();
    expect(joined[0]?.status).toBe("new");
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
  beforeEach(() => {
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue(null);
  });

  it("skips POST /v1/predictions when syncPredictions is false and still attaches Neon ids", async () => {
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
    const syncSpy = vi.spyOn(syncPredictions, "syncPredictionsToBackend");
    vi.spyOn(backendClient, "getTenantSignals").mockResolvedValue([
      { ...neonReviewed, feedback: null },
    ]);
    vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const result = await tryHydrateStoreFromNeon({ syncPredictions: false });

    expect(syncSpy).not.toHaveBeenCalled();
    expect(result?.signals[0].backendSignalId).toBe("pred-hydrated-1");
    expect(result?.signals[0].feedback).toBeUndefined();
  });

  it("detects, syncs predictions, and writes store without conversation upsert", async () => {
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([
      partnerRow({ ground_truth: "retention" }),
    ]);
    const upsertSpy = vi.spyOn(backendClient, "upsertConversations");
    const detectSpy = vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
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
    expectAdaptOverrides(detectSpy.mock.calls[0]?.[3] as TaxonomyOverrides);
    expectAdaptOverrides(result?.taxonomyOverrides);
    expectAdaptOverrides(
      (writeSpy.mock.calls[0]?.[0] as { taxonomyOverrides?: TaxonomyOverrides })
        .taxonomyOverrides
    );
    expect(result?.taxonomyOverrides?.lead?.negativePhrases).toEqual(
      PARTNER_EXPORT_ADAPT_OVERRIDES.lead?.negativePhrases
    );
    expect(result?.pilot?.baselineOpportunities).toBe(0);
    expect(result?.pilot?.weeklyExportCount).toBeUndefined();
    expect(result?.signals[0].backendSignalId).toBe("pred-hydrated-1");
    expect(result?.signals[0].groundTruth).toBe("retention");
    expect(result?.signals[0].feedback).toBeUndefined();
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("restores Neon pilot weeklyExportCount and baseline onto store", async () => {
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
    vi.spyOn(backendClient, "getTenantSignals").mockResolvedValue([]);
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-uuid-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: "partner agreed",
      weekly_export_count: 2,
      last_uploaded_file_name: "Groww_batch_02",
      created_at: "2026-08-10T10:00:00.000Z",
      updated_at: "2026-08-12T10:00:00.000Z",
    });
    const writeSpy = vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const result = await tryHydrateStoreFromNeon();

    expect(result?.pilot).toEqual({
      baselineOpportunities: 12,
      baselineNote: "partner agreed",
      weeklyExportCount: 2,
      lastUploadedFileName: "Groww_batch_02",
      updatedAt: "2026-08-12T10:00:00.000Z",
    });
    expect(writeSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        pilot: expect.objectContaining({
          baselineOpportunities: 12,
          weeklyExportCount: 2,
          lastUploadedFileName: "Groww_batch_02",
        }),
      })
    );
  });

  it("does not invent lastUploadedFileName when Neon filename is null", async () => {
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
    vi.spyOn(backendClient, "getTenantSignals").mockResolvedValue([]);
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-uuid-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: null,
      weekly_export_count: 1,
      last_uploaded_file_name: null,
      created_at: "2026-08-10T10:00:00.000Z",
      updated_at: "2026-08-12T10:00:00.000Z",
    });
    vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const result = await tryHydrateStoreFromNeon();

    expect(result?.pilot?.baselineOpportunities).toBe(12);
    expect(result?.pilot?.weeklyExportCount).toBe(1);
    expect(result?.pilot?.lastUploadedFileName).toBeUndefined();
    expect(result?.pilot?.baselineNote).toBeUndefined();
  });

  it("keeps shell pilot when pilot GET fails", async () => {
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
    vi.spyOn(backendClient, "getTenantSignals").mockResolvedValue([]);
    vi.spyOn(backendClient, "getPilotSettings").mockRejectedValue(
      new BackendClientError("database_unavailable", 500)
    );
    vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const result = await tryHydrateStoreFromNeon();

    expect(result?.pilot?.baselineOpportunities).toBe(0);
    expect(result?.pilot?.weeklyExportCount).toBeUndefined();
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

  it("still writes chats and Adapt overrides when detect throws after a successful GET", async () => {
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
    expectAdaptOverrides(result?.taxonomyOverrides);
    expectAdaptOverrides(
      (writeSpy.mock.calls[0]?.[0] as { taxonomyOverrides?: TaxonomyOverrides })
        .taxonomyOverrides
    );
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("hydrates with Adapt detect vs base on portfolio-review chat", async () => {
    vi.stubEnv("DETECT_LLM", "");
    const row = partnerRow({
      conversation_id: "conv_upsell_pr",
      external_id: "upsell_pr",
      messages: [
        {
          id: MSG_UUID,
          tenant_id: "tenant_demo",
          conversation_id: "conv_upsell_pr",
          message_id: "msg_upsell_pr",
          role: "customer",
          content: ADAPT_CHAT_CONTENT,
          timestamp: "2026-08-01T10:00:00.000Z",
          created_at: "2026-08-01T10:00:00.000Z",
        },
      ],
    });
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([row]);
    vi.spyOn(syncPredictions, "syncPredictionsToBackend").mockImplementation(
      async (signals) => ({
        signals,
        sync: {
          attempted: signals.length,
          created: 0,
          updated: 0,
          failed: 0,
          skipped: 0,
        },
      })
    );
    vi.spyOn(backendClient, "getTenantSignals").mockResolvedValue([]);
    vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const mapped = mapBackendConversationsToStore([row], "tenant_demo");
    const baseSignals = runDetection(
      mapped.conversations,
      mapped.messages,
      "tenant_demo"
    );
    expect(baseSignals.some((signal) => signal.type === "lead")).toBe(true);
    expect(baseSignals.some((signal) => signal.type === "upsell")).toBe(false);

    const result = await tryHydrateStoreFromNeon();

    expectAdaptOverrides(result?.taxonomyOverrides);
    expect(result?.signals.some((signal) => signal.type === "upsell")).toBe(
      true
    );
    expect(result?.signals.some((signal) => signal.type === "lead")).toBe(
      false
    );
  });

  it("returns null without writeStore when Neon is empty", async () => {
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([]);
    const writeSpy = vi.spyOn(store, "writeStore");
    const detectSpy = vi.spyOn(detectLlm, "runHybridDetection");

    await expect(tryHydrateStoreFromNeon()).resolves.toBeNull();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(detectSpy).not.toHaveBeenCalled();
  });

  it("drops Sample rows written before a weekly filename and stamps the fresh chats", async () => {
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-week7",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: null,
      weekly_export_count: 3,
      last_uploaded_file_name: "Zerodha_week_7_batch_01.json",
      created_at: "2026-09-27T12:00:00.000Z",
      updated_at: "2026-09-27T12:00:00.000Z",
    });
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([
      partnerRow({
        conversation_id: "conv_groww",
        customer_name: "Eeshan Kulkarni",
        updated_at: "2026-09-01T00:00:00.000Z",
      }),
      partnerRow({
        conversation_id: "conv_aditya",
        customer_name: "Aditya Pawar",
        updated_at: "2026-09-27T12:00:05.000Z",
      }),
    ]);
    vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
      signals: [{ ...detectedSignal, conversationId: "conv_aditya" }],
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
          conversationId: "conv_aditya",
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
    vi.spyOn(store, "writeStore").mockResolvedValue(undefined);

    const result = await tryHydrateStoreFromNeon({ freshOnly: true });

    expect(result?.conversations.map((row) => row.id)).toEqual(["conv_aditya"]);
    expect(result?.conversations[0]?.customerName).toBe("Aditya Pawar");
    expect(result?.conversations[0]?.sourceFile).toBe(
      "Zerodha_week_7_batch_01.json",
    );
    expect(result?.pilot?.lastUploadedFileName).toBe(
      "Zerodha_week_7_batch_01.json",
    );
  });

  it("drops bundled showcase ids before paint even when they are newer than the pilot", async () => {
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-week7",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: null,
      weekly_export_count: 3,
      last_uploaded_file_name: "Zerodha_week_7_batch_01.json",
      created_at: "2026-09-27T12:00:00.000Z",
      updated_at: "2026-09-27T12:00:00.000Z",
    });
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([
      partnerRow({
        conversation_id: "conv_rucha_patwardhan_12",
        customer_name: "Rucha Patwardhan",
        external_id: "rucha_patwardhan_12",
        updated_at: "2026-09-27T12:05:00.000Z",
      }),
      partnerRow({
        conversation_id: "conv_aditya",
        customer_name: "Aditya Pawar",
        external_id: "aditya_week7",
        updated_at: "2026-09-27T12:05:00.000Z",
      }),
    ]);
    vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
      signals: [{ ...detectedSignal, conversationId: "conv_aditya" }],
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
      signals: [{ ...detectedSignal, conversationId: "conv_aditya" }],
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

    expect(result?.conversations.map((row) => row.customerName)).toEqual([
      "Aditya Pawar",
    ]);
    expect(result?.conversations.map((row) => row.id)).toEqual(["conv_aditya"]);
  });

  it("day-1 replace hydrates only chats written with the filename", async () => {
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-week7",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: null,
      weekly_export_count: 1,
      last_uploaded_file_name: "Zerodha_week_7_batch_01.json",
      created_at: "2026-09-27T12:00:00.000Z",
      updated_at: "2026-09-27T12:00:00.000Z",
    });
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([
      partnerRow({
        conversation_id: "conv_old_pack",
        customer_name: "Older Pack",
        updated_at: "2026-09-01T00:00:00.000Z",
      }),
      partnerRow({
        conversation_id: "conv_aditya",
        customer_name: "Aditya Pawar",
        updated_at: "2026-09-27T12:00:05.000Z",
      }),
    ]);
    vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
      signals: [{ ...detectedSignal, conversationId: "conv_aditya" }],
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
      signals: [{ ...detectedSignal, conversationId: "conv_aditya" }],
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

    expect(result?.conversations.map((row) => row.id)).toEqual(["conv_aditya"]);
  });

  it("returns null when the weekly filename is set and no chat is that new", async () => {
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-week7",
      tenant_id: "tenant_demo",
      baseline_opportunities: 0,
      baseline_note: null,
      weekly_export_count: 3,
      last_uploaded_file_name: "Zerodha_week_7_batch_01.json",
      created_at: "2026-09-27T12:00:00.000Z",
      updated_at: "2026-09-27T12:00:00.000Z",
    });
    vi.spyOn(backendClient, "getConversations").mockResolvedValue([
      partnerRow({ updated_at: "2026-09-01T00:00:00.000Z" }),
    ]);
    const writeSpy = vi.spyOn(store, "writeStore");

    await expect(tryHydrateStoreFromNeon()).resolves.toBeNull();
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe("filterConversationsForLivePartner", () => {
  it("keeps every row when the pilot file is Sample", () => {
    const rows = [partnerRow()];
    expect(
      filterConversationsForLivePartner(rows, {
        last_uploaded_file_name: "Groww_batch_02",
        updated_at: "2026-09-27T12:00:00.000Z",
      }).apply,
    ).toBe(false);
  });
});

describe("overlay chats (request-scoped)", () => {
  it("filters hydrated chats to the missing conversation ids", () => {
    const chats = mapBackendConversationsToStore(
      [
        partnerRow(),
        partnerRow({
          conversation_id: "conv_other",
          messages: [
            {
              id: "22222222-2222-3333-4444-555555555555",
              tenant_id: "tenant_demo",
              conversation_id: "conv_other",
              message_id: "msg_other",
              role: "customer",
              content: "Hello",
              timestamp: "2026-08-01T10:00:00.000Z",
              created_at: "2026-08-01T10:00:00.000Z",
            },
          ],
        }),
      ],
      "tenant_demo"
    );
    const filtered = filterHydratedChats(chats, ["conv_partner_upload_1"]);
    expect(filtered.conversations.map((c) => c.id)).toEqual([
      "conv_partner_upload_1",
    ]);
    expect(
      filtered.messages.every(
        (m) => m.conversationId === "conv_partner_upload_1"
      )
    ).toBe(true);
  });

  it("merges overlay under store rows without replacing ids", () => {
    const storeConv = {
      id: "conv_keep",
      tenantId: "tenant_demo",
      channel: "whatsapp",
      startedAt: "2026-08-01T00:00:00.000Z",
      messageIds: ["msg_keep"],
    };
    const merged = mergeOverlayChats(
      [storeConv],
      [
        {
          id: "msg_keep",
          conversationId: "conv_keep",
          role: "customer",
          content: "Keep",
          timestamp: "2026-08-01T00:00:00.000Z",
        },
      ],
      {
        conversations: [
          { ...storeConv, customerName: "Should not win" },
          {
            id: "conv_new",
            tenantId: "tenant_demo",
            channel: "whatsapp",
            startedAt: "2026-08-01T00:00:00.000Z",
            messageIds: ["msg_new"],
          },
        ],
        messages: [
          {
            id: "msg_new",
            conversationId: "conv_new",
            role: "customer",
            content: "Overlay",
            timestamp: "2026-08-01T00:00:00.000Z",
          },
        ],
      }
    );
    expect(merged.conversations.map((c) => c.id)).toEqual([
      "conv_keep",
      "conv_new",
    ]);
    expect(merged.conversations[0].customerName).toBeUndefined();
  });

  it("fetchOverlayConversations returns null when keep set is empty", async () => {
    const spy = vi.spyOn(backendClient, "getConversations");
    await expect(
      fetchOverlayConversations("tenant_demo", [])
    ).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetchOverlayConversations requests only the missing conversation ids", async () => {
    const spy = vi
      .spyOn(backendClient, "getConversations")
      .mockResolvedValue([partnerRow()]);

    const overlay = await fetchOverlayConversations("tenant_demo", [
      "conv_partner_upload_1",
      "conv_missing",
    ]);

    expect(spy).toHaveBeenCalledWith("tenant_demo", {
      conversationIds: ["conv_partner_upload_1", "conv_missing"],
    });
    expect(overlay?.conversations.map((row) => row.id)).toEqual([
      "conv_partner_upload_1",
    ]);
  });
});
