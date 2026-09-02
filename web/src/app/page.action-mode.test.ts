import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { StoreData } from "@/lib/types";

const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${url}`), { digest: url });
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

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
  loadStore: vi.fn(),
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

vi.mock("@/lib/views", async () => {
  const actual = await vi.importActual<typeof import("@/lib/views")>(
    "@/lib/views"
  );
  return {
    ...actual,
    // Vitest NODE_ENV is "test" (not development) — force locked for redirect.
    isActionModeUnlocked: () => false,
  };
});

import PlatformPage from "./page";
import { InsightsView } from "@/components/views/InsightsView";
import { loadStore } from "@/lib/store";
import { fetchNeedsReview } from "@/lib/fetch-needs-review";
import { fetchTenantSignals } from "@/lib/fetch-tenant-signals";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";

function mockStore(): StoreData {
  return {
    tenant: {
      id: "tenant_demo",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    conversations: [],
    messages: [],
    signals: [],
    pilot: { baselineOpportunities: 0 },
  };
}

/** Walk SSR element tree for InsightsView props (components are not invoked). */
function findInsightsViewProps(
  node: ReactNode,
): { statusFilter?: string; statusOmitted?: boolean } | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findInsightsViewProps(child);
      if (found) return found;
    }
    return null;
  }
  const el = node as ReactElement<{
    children?: ReactNode;
    statusFilter?: string;
    statusOmitted?: boolean;
  }>;
  if (el.type === InsightsView) {
    return {
      statusFilter: el.props.statusFilter,
      statusOmitted: el.props.statusOmitted,
    };
  }
  if (el.props?.children != null) {
    return findInsightsViewProps(el.props.children);
  }
  return null;
}

describe("PlatformPage Action Mode lock bounce", () => {
  beforeEach(() => {
    redirect.mockClear();
    vi.mocked(loadStore).mockResolvedValue({
      store: mockStore(),
      coldStart: false,
    });
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({
      ok: true,
      rows: [],
    });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue(null);
  });

  it("redirects locked ?mode=action to the same URL without mode", async () => {
    await expect(
      PlatformPage({
        searchParams: Promise.resolve({
          view: "insights",
          mode: "action",
          status: "followup",
          scoreFrom: "2026-08-17",
        }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(redirect).toHaveBeenCalledWith(
      "/?view=insights&status=followup&scoreFrom=2026-08-17"
    );
  });

  it("defaults view when stripping locked mode=action", async () => {
    await expect(
      PlatformPage({
        searchParams: Promise.resolve({ mode: "action" }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(redirect).toHaveBeenCalledWith("/?view=insights");
  });

  it("does not redirect shadow mode", async () => {
    const result = (await PlatformPage({
      searchParams: Promise.resolve({ view: "insights" }),
    })) as ReactElement;

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});

describe("PlatformPage Insights pending landing", () => {
  const pendingPrediction = {
    id: "pred-1",
    tenant_id: "tenant_demo",
    conversation_id: "conv_1",
    signal_type: "lead" as const,
    confidence: 0.9,
    summary: "Buying intent",
    created_at: "2026-08-01T00:00:00.000Z",
  };

  const storeWithPending: StoreData = {
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
    ],
    messages: [],
    signals: [
      {
        id: "sig_1",
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
        backendSignalId: "pred-1",
      },
    ],
    pilot: { baselineOpportunities: 0 },
  };

  beforeEach(() => {
    redirect.mockClear();
    vi.mocked(loadStore).mockResolvedValue({
      store: storeWithPending,
      coldStart: false,
    });
    vi.mocked(fetchNeedsReview).mockResolvedValue({
      ok: true,
      predictions: [pendingPrediction],
    });
    vi.mocked(fetchTenantSignals).mockResolvedValue({
      ok: true,
      rows: [],
    });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue(null);
  });

  it("renders Pending on first SSR when status omitted and Follow-up empty (no redirect)", async () => {
    const result = (await PlatformPage({
      searchParams: Promise.resolve({ view: "insights" }),
    })) as ReactElement;

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
    const props = findInsightsViewProps(result);
    expect(props?.statusFilter).toBe("new");
    expect(props?.statusOmitted).toBe(true);
  });

  it("does not redirect explicit status=followup (compact empty path)", async () => {
    const result = (await PlatformPage({
      searchParams: Promise.resolve({
        view: "insights",
        status: "followup",
      }),
    })) as ReactElement;

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
    const props = findInsightsViewProps(result);
    expect(props?.statusFilter).toBe("followup");
    expect(props?.statusOmitted).toBe(false);
  });

  it("does not redirect when already on status=new", async () => {
    const result = (await PlatformPage({
      searchParams: Promise.resolve({
        view: "insights",
        status: "new",
      }),
    })) as ReactElement;

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
    const props = findInsightsViewProps(result);
    expect(props?.statusFilter).toBe("new");
    expect(props?.statusOmitted).toBe(false);
  });
});
