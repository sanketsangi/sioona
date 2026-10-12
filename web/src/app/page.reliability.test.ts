import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { StoreData } from "@/lib/types";

vi.mock("@/components/AppShell", () => ({
  AppShell: vi.fn(() => null),
}));

vi.mock("@/components/views/InsightsView", () => ({
  InsightsView: () => null,
}));

vi.mock("@/components/views/UploadView", () => ({
  UploadView: () => null,
}));

vi.mock("@/components/views/EvalView", () => ({
  EvalView: () => null,
}));

vi.mock("@/components/views/TaxonomyView", () => ({
  TaxonomyView: () => null,
}));

vi.mock("@/lib/adopt-neon-keep-set", () => ({
  adoptNeonKeepSetWhenLocalMisses: vi.fn(
    async (store: StoreData) => store,
  ),
}));

vi.mock("@/lib/supervised-action-persistence", () => ({
  overlaySupervisedActionsFromNeon: vi.fn(async () => undefined),
}));

vi.mock("@/lib/store", () => ({
  readStore: vi.fn(),
  loadStore: vi.fn(),
  writeStore: vi.fn().mockResolvedValue(undefined),
  persistMissingSupervisedDrafts: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/fetch-needs-review", () => ({
  fetchNeedsReview: vi.fn(),
}));

vi.mock("@/lib/fetch-tenant-signals", () => ({
  fetchTenantSignals: vi.fn(),
}));

vi.mock("@/lib/fetch-signal-score", () => ({
  fetchSignalScoreSafe: vi.fn(),
}));

vi.mock("@/lib/hydrate-conversations", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/hydrate-conversations")>();
  return {
    ...actual,
    fetchOverlayConversations: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/lib/defer-prediction-sync", () => ({
  persistDeferredPredictionSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sync-pilot", () => ({
  refreshStorePilotFromNeon: vi.fn(async (store: StoreData) => store),
  persistHealedPilot: vi.fn().mockResolvedValue(undefined),
  persistDeferredPilotRefresh: vi.fn().mockResolvedValue(undefined),
}));

import PlatformPage from "./page";
import { fetchNeedsReview } from "@/lib/fetch-needs-review";
import { fetchTenantSignals } from "@/lib/fetch-tenant-signals";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import { fetchOverlayConversations } from "@/lib/hydrate-conversations";
import { loadStore } from "@/lib/store";
import { persistDeferredPredictionSync } from "@/lib/defer-prediction-sync";
import {
  persistDeferredPilotRefresh,
  refreshStorePilotFromNeon,
} from "@/lib/sync-pilot";
import { after } from "next/server";

function pageShellProps(result: ReactElement) {
  return result.props as {
    activeView: string;
    title: string;
    lastUploadedFileName?: string;
    headerBatchName?: string;
    notifications: { id: string; title?: string; description?: string }[];
    children?: ReactNode;
  };
}

function insightsViewProps(result: ReactElement): {
  tenantSignals: { ok: boolean; rows?: { id: string }[] };
  cadencePreviewId: string | null | undefined;
  jsonKeepSet?: boolean;
  overlayChats?: unknown;
} {
  const { children } = pageShellProps(result);
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (
      child &&
      typeof child === "object" &&
      "props" in child &&
      child.props &&
      typeof child.props === "object" &&
      "tenantSignals" in child.props
    ) {
      return child.props as {
        tenantSignals: { ok: boolean; rows?: { id: string }[] };
        cadencePreviewId: string | null | undefined;
        jsonKeepSet?: boolean;
        overlayChats?: unknown;
      };
    }
  }
  throw new Error("InsightsView props not found in AppShell children");
}

function stubStore(store: StoreData, coldStart = false) {
  vi.mocked(loadStore).mockResolvedValue({ store, coldStart });
}

function mockStore(
  signals: StoreData["signals"] = [
    {
      id: "sig_unsynced",
      tenantId: "tenant_demo",
      conversationId: "conv_1",
      type: "lead",
      score: 0.9,
      confidence: 0.9,
      summary: "Buying intent",
      suggestedAction: "Follow up",
      evidence: ["quote"],
      status: "new",
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "sig_synced",
      tenantId: "tenant_demo",
      conversationId: "conv_2",
      type: "retention",
      score: 0.8,
      confidence: 0.8,
      summary: "Churn risk",
      suggestedAction: "Retain",
      evidence: ["quote"],
      status: "new",
      createdAt: "2026-08-01T00:00:00.000Z",
      backendSignalId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    },
  ]
): StoreData {
  return {
    tenant: {
      id: "tenant_demo",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    conversations: [
      {
        id: "conv_1",
        tenantId: "tenant_demo",
        channel: "whatsapp",
        startedAt: "2026-08-01T00:00:00.000Z",
        messageIds: [],
      },
      {
        id: "conv_2",
        tenantId: "tenant_demo",
        channel: "whatsapp",
        startedAt: "2026-08-01T00:00:00.000Z",
        messageIds: [],
      },
    ],
    messages: [],
    signals,
    pilot: { baselineOpportunities: 0 },
  };
}

describe("PlatformPage deploy reliability", () => {
  beforeEach(() => {
    stubStore(mockStore());
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: false,
      error: "ECONNREFUSED",
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({
      ok: false,
      error: "ECONNREFUSED",
    });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the sync-failed banner from a deferred dual-write failure on the next Insights load", async () => {
    const stored = mockStore();
    stored.predictionSyncFailure = { failed: 2, created: 1 };
    stubStore(stored);

    const result = (await PlatformPage({
      searchParams: Promise.resolve({ view: "insights", status: "new" }),
    })) as ReactElement;

    const syncFailed = pageShellProps(result).notifications.find(
      (item) => item.id === "sync-failed"
    );
    expect(syncFailed?.title).toBe("Prediction sync incomplete");
    expect(syncFailed?.description).toBe(
      "2 predictions not written (1 succeeded). Re-run Detection from Insights."
    );
  });

  it("surfaces queue-unavailable and sync-failed when backend is down (no duplicate score card)", async () => {
    const result = (await PlatformPage({
      searchParams: Promise.resolve({
        view: "insights",
        status: "new",
        syncFailed: "2",
        syncCreated: "1",
      }),
    })) as ReactElement;

    const { notifications } = pageShellProps(result);
    expect(notifications.map((n) => n.id)).toEqual([
      "queue-unavailable",
      "sync-failed",
    ]);
    expect(notifications.some((n) => n.id === "score-unavailable")).toBe(false);
  });

  it("does not call the review queue down while a replace upload is still opening", async () => {
    const result = (await PlatformPage({
      searchParams: Promise.resolve({
        view: "insights",
        imported: "100",
        signals: "20",
        llmFailed: "2",
        replaced: "1",
        file: "Zerodha_week_7_batch_01.json",
      }),
    })) as ReactElement;

    const { notifications } = pageShellProps(result);
    expect(notifications.map((n) => n.id)).toEqual([
      "import-complete",
      "llm-pass-failed",
    ]);
    expect(notifications.some((n) => n.id === "queue-unavailable")).toBe(false);
    expect(notifications.some((n) => n.id === "score-unavailable")).toBe(false);
    expect(
      notifications.find((n) => n.id === "import-complete")?.description,
    ).toBe("This export is still opening. The chats show up here in a moment.");
    expect(
      notifications.find((n) => n.id === "llm-pass-failed")?.description,
    ).not.toContain("still in the queue");
  });

  it("hides sync-failed when URL is stale but store is fully dual-written", async () => {
    stubStore(
      mockStore([
        {
          id: "sig_a",
          tenantId: "tenant_demo",
          conversationId: "conv_1",
          type: "lead",
          score: 0.9,
          confidence: 0.9,
          summary: "Buying intent",
          suggestedAction: "Follow up",
          evidence: [],
          status: "new",
          createdAt: "2026-08-01T00:00:00.000Z",
          backendSignalId: "uuid-a",
        },
        {
          id: "sig_b",
          tenantId: "tenant_demo",
          conversationId: "conv_2",
          type: "retention",
          score: 0.8,
          confidence: 0.8,
          summary: "Churn",
          suggestedAction: "Retain",
          evidence: [],
          status: "new",
          createdAt: "2026-08-01T00:00:00.000Z",
          backendSignalId: "uuid-b",
        },
      ])
    );

    const result = (await PlatformPage({
      searchParams: Promise.resolve({
        view: "insights",
        status: "new",
        syncFailed: "2",
        syncCreated: "1",
      }),
    })) as ReactElement;

    const { notifications } = pageShellProps(result);
    expect(notifications.map((n) => n.id)).toEqual(["queue-unavailable"]);
    expect(notifications.some((n) => n.id === "score-unavailable")).toBe(false);
  });

  it("falls back to local unreviewed count when needs-review fails", async () => {
    stubStore(
      mockStore([
        {
          id: "sig_reviewed",
          tenantId: "tenant_demo",
          conversationId: "conv_1",
          type: "lead",
          score: 0.9,
          confidence: 0.9,
          summary: "Done",
          suggestedAction: "",
          evidence: [],
          status: "reviewed",
          createdAt: "2026-08-01T00:00:00.000Z",
          feedback: {
            label: "correct",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        },
        {
          id: "sig_open",
          tenantId: "tenant_demo",
          conversationId: "conv_2",
          type: "retention",
          score: 0.8,
          confidence: 0.8,
          summary: "Open",
          suggestedAction: "",
          evidence: [],
          status: "new",
          createdAt: "2026-08-01T00:00:00.000Z",
          backendSignalId: "uuid-b",
        },
      ])
    );

    const result = (await PlatformPage({
      searchParams: Promise.resolve({ view: "insights" }),
    })) as ReactElement;

    const { notifications } = pageShellProps(result);
    expect(notifications[0]?.id).toBe("queue-unavailable");
    expect(notifications.some((n) => n.id === "pending-review")).toBe(false);
  });

  it("loads upload and eval views without throwing when backend is unreachable", async () => {
    const upload = (await PlatformPage({
      searchParams: Promise.resolve({ view: "upload" }),
    })) as ReactElement;
    expect(pageShellProps(upload)).toMatchObject({
      activeView: "upload",
      title: "Uploaded Chats",
    });

    const evalView = (await PlatformPage({
      searchParams: Promise.resolve({ view: "eval" }),
    })) as ReactElement;
    expect(pageShellProps(evalView)).toMatchObject({
      activeView: "eval",
      title: "Eval & SignalScore",
    });
  });

  it("passes Neon tenantSignals and cadencePreviewId from Correct not Acted", async () => {
    vi.mocked(fetchNeedsReview).mockResolvedValue({ ok: true, predictions: [] });
    vi.mocked(fetchTenantSignals).mockResolvedValue({
      ok: true,
      rows: [
        {
          id: "pred-follow",
          tenant_id: "tenant_demo",
          conversation_id: "conv_1",
          signal_type: "lead",
          confidence: 0.9,
          summary: "Buying intent",
          acted: false,
          created_at: "2026-08-01T00:00:00.000Z",
          feedback: {
            id: "fb-1",
            tenant_id: "tenant_demo",
            signal_id: "pred-follow",
            feedback: "correct",
            note: null,
            reviewed_by: "shadow_reviewer",
            reviewed_at: "2026-08-02T00:00:00.000Z",
          },
        },
        {
          id: "pred-acted",
          tenant_id: "tenant_demo",
          conversation_id: "conv_2",
          signal_type: "retention",
          confidence: 0.8,
          summary: "Churn",
          acted: true,
          created_at: "2026-08-01T00:00:00.000Z",
          feedback: {
            id: "fb-2",
            tenant_id: "tenant_demo",
            signal_id: "pred-acted",
            feedback: "correct",
            note: null,
            reviewed_by: "shadow_reviewer",
            reviewed_at: "2026-08-02T00:00:00.000Z",
          },
        },
      ],
    });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue({
      tenant_id: "tenant_demo",
      signal_score: 1,
      reviewed_count: 2,
      correct_count: 2,
      incorrect_count: 0,
      partially_correct_count: 0,
      by_signal_type: [],
    });
    stubStore(
      mockStore([
        {
          id: "sig_follow",
          tenantId: "tenant_demo",
          conversationId: "conv_1",
          type: "lead",
          score: 0.9,
          confidence: 0.9,
          summary: "Buying intent",
          suggestedAction: "Follow up",
          evidence: ["quote"],
          status: "reviewed",
          createdAt: "2026-08-01T00:00:00.000Z",
          backendSignalId: "pred-follow",
          feedback: {
            label: "correct",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        },
        {
          id: "sig_acted",
          tenantId: "tenant_demo",
          conversationId: "conv_2",
          type: "retention",
          score: 0.8,
          confidence: 0.8,
          summary: "Churn",
          suggestedAction: "Retain",
          evidence: ["quote"],
          status: "acted",
          createdAt: "2026-08-01T00:00:00.000Z",
          backendSignalId: "pred-acted",
          feedback: {
            label: "correct",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        },
      ])
    );

    const result = (await PlatformPage({
      searchParams: Promise.resolve({ view: "insights" }),
    })) as ReactElement;

    expect(fetchTenantSignals).toHaveBeenCalledWith("tenant_demo", {
      conversationIds: ["conv_1", "conv_2"],
    });
    const props = insightsViewProps(result);
    expect(props.tenantSignals.ok).toBe(true);
    if (props.tenantSignals.ok) {
      expect(props.tenantSignals.rows?.map((r) => r.id)).toEqual([
        "pred-follow",
        "pred-acted",
      ]);
    }
    expect(props.cadencePreviewId).toBe("sig_follow");
  });

  it("omits SignalScore conversation ids when JSON has chats (Neon fills hydrate lag)", async () => {
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [
        {
          id: "hydrate-pred",
          tenant_id: "tenant_demo",
          conversation_id: "conv_hydrated",
          signal_type: "retention",
          confidence: 0.81,
          summary: "After wipe",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue(null);
    stubStore(mockStore([]));

    await PlatformPage({
      searchParams: Promise.resolve({ view: "eval" }),
    });

    // Active JSON keep-set → no leftover-pack overlay; FastAPI score omits
    // conversation_id so Neon can count in-window reviews not yet in JSON.
    expect(fetchOverlayConversations).not.toHaveBeenCalled();
    expect(
      vi.mocked(fetchSignalScoreSafe).mock.calls.map((call) => call[1])
    ).toEqual([undefined, undefined]);
    expect(fetchSignalScoreSafe).toHaveBeenCalledTimes(2);
  });

  it("passes overlay keep-set to SignalScore when JSON store is empty", async () => {
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [
        {
          id: "hydrate-pred",
          tenant_id: "tenant_demo",
          conversation_id: "conv_hydrated",
          signal_type: "retention",
          confidence: 0.81,
          summary: "Neon-only",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(fetchOverlayConversations).mockResolvedValue({
      conversations: [
        {
          id: "conv_hydrated",
          tenantId: "tenant_demo",
          channel: "whatsapp",
          startedAt: "2026-08-01T00:00:00.000Z",
          messageIds: [],
        },
      ],
      messages: [],
    });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue(null);
    const empty = mockStore([]);
    empty.conversations = [];
    stubStore(empty);

    await PlatformPage({
      searchParams: Promise.resolve({ view: "eval" }),
    });

    const keepSet = ["conv_hydrated"];
    expect(fetchOverlayConversations).toHaveBeenCalledWith("tenant_demo", [
      "conv_hydrated",
    ]);
    expect(
      vi.mocked(fetchSignalScoreSafe).mock.calls.map((call) => call[1])
    ).toEqual([keepSet, keepSet]);
    expect(fetchSignalScoreSafe).toHaveBeenCalledTimes(2);
  });

  it("skips leftover Neon overlay after replace ingest landing", async () => {
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [
        {
          id: "old-pack",
          tenant_id: "tenant_demo",
          conversation_id: "conv_old_pack",
          signal_type: "lead",
          confidence: 0.9,
          summary: "Leftover before prune",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue(null);
    stubStore(mockStore());

    const result = (await PlatformPage({
      searchParams: Promise.resolve({
        view: "insights",
        imported: "1",
        signals: "1",
        replaced: "1",
      }),
    })) as ReactElement;

    expect(fetchOverlayConversations).not.toHaveBeenCalled();
    const props = insightsViewProps(result);
    expect(props.jsonKeepSet).toBe(true);
    expect(props.overlayChats).toBeNull();
    expect(vi.mocked(fetchSignalScoreSafe).mock.calls[0]?.[1]).toEqual([
      "conv_1",
      "conv_2",
    ]);
  });

  it("skips leftover Neon overlay when JSON keep-set already has chats", async () => {
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [
        {
          id: "old-pack",
          tenant_id: "tenant_demo",
          conversation_id: "conv_old_pack",
          signal_type: "lead",
          confidence: 0.9,
          summary: "Leftover Sample vs Partner Demo",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue(null);
    stubStore(mockStore());

    const result = (await PlatformPage({
      searchParams: Promise.resolve({ view: "insights", status: "new" }),
    })) as ReactElement;

    expect(fetchOverlayConversations).not.toHaveBeenCalled();
    expect(insightsViewProps(result).overlayChats).toBeNull();
  });

  it("requests overlay chats for unmatched pending ids only when JSON is empty", async () => {
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [
        {
          id: "hydrate-pred",
          tenant_id: "tenant_demo",
          conversation_id: "conv_hydrated",
          signal_type: "retention",
          confidence: 0.81,
          summary: "After wipe",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue(null);
    const empty = mockStore([]);
    empty.conversations = [];
    stubStore(empty);

    await PlatformPage({
      searchParams: Promise.resolve({ view: "insights", status: "new" }),
    });

    expect(fetchOverlayConversations).toHaveBeenCalledWith("tenant_demo", [
      "conv_hydrated",
    ]);
  });

  it("fetches overlay chats on Eval wipe recovery so keep-set can include stub ids", async () => {
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [
        {
          id: "hydrate-pred",
          tenant_id: "tenant_demo",
          conversation_id: "conv_hydrated",
          signal_type: "retention",
          confidence: 0.81,
          summary: "After wipe",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });
    const empty = mockStore([]);
    empty.conversations = [];
    stubStore(empty);

    await PlatformPage({
      searchParams: Promise.resolve({ view: "eval" }),
    });

    expect(fetchOverlayConversations).toHaveBeenCalledWith("tenant_demo", [
      "conv_hydrated",
    ]);
  });

  it("skips Insights queue and SignalScore fetches on Upload and Taxonomy", async () => {
    await PlatformPage({
      searchParams: Promise.resolve({ view: "upload" }),
    });
    await PlatformPage({
      searchParams: Promise.resolve({ view: "taxonomy" }),
    });

    expect(fetchNeedsReview).not.toHaveBeenCalled();
    expect(fetchTenantSignals).not.toHaveBeenCalled();
    expect(fetchOverlayConversations).not.toHaveBeenCalled();
    expect(fetchSignalScoreSafe).not.toHaveBeenCalled();
  });

  it("fetches windowed SignalScore once on Insights (no all-time call)", async () => {
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue(null);

    await PlatformPage({
      searchParams: Promise.resolve({ view: "insights" }),
    });

    expect(fetchNeedsReview).toHaveBeenCalledTimes(1);
    expect(fetchTenantSignals).toHaveBeenCalledTimes(1);
    expect(fetchSignalScoreSafe).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchSignalScoreSafe).mock.calls[0]?.[2]).toEqual({
      dateFrom: expect.anything(),
    });
  });

  it("never awaits POST /v1/predictions on GET / (loadStore skips dual-write)", async () => {
    await PlatformPage({
      searchParams: Promise.resolve({ view: "insights" }),
    });
    await PlatformPage({
      searchParams: Promise.resolve({ view: "upload" }),
    });

    expect(loadStore).toHaveBeenCalledWith({
      syncPredictions: false,
      freshOnly: false,
    });
    expect(loadStore).toHaveBeenCalledTimes(2);
  });

  it("passes freshOnly on a replace landing so hydrate skips the previous pack", async () => {
    await PlatformPage({
      searchParams: Promise.resolve({ view: "insights", replaced: "1" }),
    });

    expect(loadStore).toHaveBeenCalledWith({
      syncPredictions: false,
      freshOnly: true,
    });
  });

  it("does not schedule deferred prediction sync on Upload/Taxonomy even on cold start", async () => {
    stubStore(mockStore(), true);

    await PlatformPage({
      searchParams: Promise.resolve({ view: "upload" }),
    });
    await PlatformPage({
      searchParams: Promise.resolve({ view: "taxonomy" }),
    });

    expect(after).not.toHaveBeenCalled();
    expect(persistDeferredPredictionSync).not.toHaveBeenCalled();
  });

  it("schedules deferred prediction sync on Insights/Eval cold start only", async () => {
    stubStore(mockStore(), true);
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });

    await PlatformPage({
      searchParams: Promise.resolve({ view: "insights" }),
    });
    // Cold Insights: prediction dual-write + /pilot heal (neither on TTFB).
    expect(after).toHaveBeenCalledTimes(2);
    for (const [cb] of vi.mocked(after).mock.calls) {
      cb();
    }
    expect(persistDeferredPredictionSync).toHaveBeenCalledTimes(1);
    expect(persistDeferredPilotRefresh).toHaveBeenCalledTimes(1);

    vi.mocked(after).mockClear();
    vi.mocked(persistDeferredPredictionSync).mockClear();
    vi.mocked(persistDeferredPilotRefresh).mockClear();
    await PlatformPage({
      searchParams: Promise.resolve({ view: "eval" }),
    });
    expect(after).toHaveBeenCalledTimes(2);
    for (const [cb] of vi.mocked(after).mock.calls) {
      cb();
    }
    expect(persistDeferredPredictionSync).toHaveBeenCalledTimes(1);
    expect(persistDeferredPilotRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not schedule deferred prediction sync on Insights warm start", async () => {
    stubStore(mockStore(), false);
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });

    await PlatformPage({
      searchParams: Promise.resolve({ view: "insights" }),
    });

    expect(after).toHaveBeenCalledTimes(1);
    vi.mocked(after).mock.calls[0]?.[0]?.();
    expect(persistDeferredPredictionSync).not.toHaveBeenCalled();
    expect(persistDeferredPilotRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not await GET /pilot on Insights (JSON filename; heal after paint)", async () => {
    const local = mockStore();
    local.pilot = {
      baselineOpportunities: 0,
      lastUploadedFileName: "local.json",
    };
    stubStore(local, false);
    vi.mocked(refreshStorePilotFromNeon).mockImplementation(async (store) => ({
      ...store,
      pilot: {
        ...store.pilot,
        lastUploadedFileName: "from-neon.csv",
      },
    }));
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });

    const result = (await PlatformPage({
      searchParams: Promise.resolve({ view: "insights" }),
    })) as ReactElement;

    expect(refreshStorePilotFromNeon).not.toHaveBeenCalled();
    expect(pageShellProps(result).lastUploadedFileName).toBe("local.json");
    expect(after).toHaveBeenCalledTimes(1);
    expect(fetchNeedsReview).toHaveBeenCalledTimes(1);
    expect(fetchTenantSignals).toHaveBeenCalledTimes(1);
  });

  it("awaits GET /pilot on Upload so cadence chrome uses Neon", async () => {
    const local = mockStore();
    local.pilot = {
      baselineOpportunities: 0,
      lastUploadedFileName: "local.json",
    };
    stubStore(local, false);
    vi.mocked(refreshStorePilotFromNeon).mockImplementation(async (store) => ({
      ...store,
      pilot: {
        ...store.pilot,
        lastUploadedFileName: "from-neon.csv",
        weeklyExportCount: 2,
      },
    }));

    const result = (await PlatformPage({
      searchParams: Promise.resolve({ view: "upload" }),
    })) as ReactElement;

    expect(refreshStorePilotFromNeon).toHaveBeenCalledTimes(1);
    expect(pageShellProps(result).lastUploadedFileName).toBe("from-neon.csv");
    expect(after).not.toHaveBeenCalled();
    expect(fetchNeedsReview).not.toHaveBeenCalled();
  });

  it("skips GET /pilot on Taxonomy (no cadence chrome)", async () => {
    stubStore(mockStore(), false);

    await PlatformPage({
      searchParams: Promise.resolve({ view: "taxonomy" }),
    });

    expect(refreshStorePilotFromNeon).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(persistDeferredPilotRefresh).not.toHaveBeenCalled();
  });

  it("does not claim Partner Demo Ready while the selected vault is still loading", async () => {
    const local = mockStore();
    local.pilot = {
      baselineOpportunities: 0,
      lastUploadedFileName: "Groww_batch_02",
    };
    stubStore(local, false);
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });

    const result = (await PlatformPage({
      searchParams: Promise.resolve({
        view: "insights",
        file: "Zerodha_batch_02",
        demo: "1",
      }),
    })) as ReactElement;

    const shell = pageShellProps(result);
    expect(shell.headerBatchName).toBe("Zerodha_batch_02");
    expect(shell.lastUploadedFileName).toBe("Groww_batch_02");
    expect(shell.notifications.some((n) => n.id === "partner-demo-ready")).toBe(
      false,
    );
  });

  it("claims Partner Demo Ready only after the selected batch is renderable", async () => {
    const local = mockStore();
    local.pilot = {
      baselineOpportunities: 0,
      lastUploadedFileName: "Zerodha_batch_02",
    };
    stubStore(local, false);
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });

    const result = (await PlatformPage({
      searchParams: Promise.resolve({
        view: "insights",
        file: "Zerodha_batch_02",
        demo: "1",
      }),
    })) as ReactElement;

    const shell = pageShellProps(result);
    expect(shell.headerBatchName).toBe("Zerodha_batch_02");
    expect(shell.notifications.some((n) => n.id === "partner-demo-ready")).toBe(
      true,
    );
  });
  it("does not schedule legacy replay writes after a canonical cold read", async () => {
    vi.stubEnv("SIOONA_STATE_MODE", "postgres");
    try {
      stubStore(mockStore(), true);
      vi.mocked(fetchNeedsReview).mockResolvedValue({ ok: true, predictions: [] });
      vi.mocked(fetchTenantSignals).mockResolvedValue({ ok: true, rows: [] });
      await PlatformPage({ searchParams: Promise.resolve({ view: "insights" }) });
      expect(after).not.toHaveBeenCalled();
      expect(persistDeferredPredictionSync).not.toHaveBeenCalled();
      expect(persistDeferredPilotRefresh).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });

});
