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

vi.mock("@/lib/store", () => ({
  readStore: vi.fn(),
  writeStore: vi.fn().mockResolvedValue(undefined),
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

vi.mock("@/lib/hydrate-conversations", () => ({
  fetchOverlayConversations: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/sync-pilot", () => ({
  refreshStorePilotFromNeon: vi.fn(async (store: StoreData) => store),
}));

import PlatformPage from "./page";
import { fetchNeedsReview } from "@/lib/fetch-needs-review";
import { fetchTenantSignals } from "@/lib/fetch-tenant-signals";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import { fetchOverlayConversations } from "@/lib/hydrate-conversations";
import { readStore } from "@/lib/store";

function pageShellProps(result: ReactElement) {
  return result.props as {
    activeView: string;
    title: string;
    notifications: { id: string; title?: string }[];
    children?: ReactNode;
  };
}

function insightsViewProps(result: ReactElement): {
  tenantSignals: { ok: boolean; rows?: { id: string }[] };
  cadencePreviewId: string | null | undefined;
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
      };
    }
  }
  throw new Error("InsightsView props not found in AppShell children");
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
    vi.mocked(readStore).mockResolvedValue(mockStore());
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

  it("hides sync-failed when URL is stale but store is fully dual-written", async () => {
    vi.mocked(readStore).mockResolvedValue(
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
    vi.mocked(readStore).mockResolvedValue(
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
      title: "Upload Chats",
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
    vi.mocked(readStore).mockResolvedValue(
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

    expect(fetchTenantSignals).toHaveBeenCalledWith("tenant_demo");
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

  it("requests overlay chats for unmatched pending conversation ids", async () => {
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
    vi.mocked(readStore).mockResolvedValue(mockStore([]));

    await PlatformPage({
      searchParams: Promise.resolve({ view: "insights", status: "new" }),
    });

    expect(fetchOverlayConversations).toHaveBeenCalledWith("tenant_demo", [
      "conv_hydrated",
    ]);
  });
});
