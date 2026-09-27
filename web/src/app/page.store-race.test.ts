import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreData } from "@/lib/types";

const duringShowcase: { current: (() => Promise<void>) | null } = {
  current: null,
};

vi.mock("@/components/AppShell", () => ({
  AppShell: () => null,
}));

vi.mock("@/components/views/InsightsView", () => ({
  InsightsView: () => null,
}));

vi.mock("@/components/views/EvalView", () => ({
  EvalView: () => null,
}));

vi.mock("@/components/views/UploadView", () => ({
  UploadView: () => null,
}));

vi.mock("@/components/views/TaxonomyView", () => ({
  TaxonomyView: () => null,
}));

vi.mock("@/lib/adopt-neon-keep-set", () => ({
  adoptNeonKeepSetWhenLocalMisses: vi.fn(async (store: StoreData) => store),
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

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/lib/showcase-keep-set", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/showcase-keep-set")>();
  return {
    ...actual,
    bundledShowcaseConversationIds: async () => {
      if (duringShowcase.current) await duringShowcase.current();
      return actual.bundledShowcaseConversationIds();
    },
  };
});

import PlatformPage from "./page";
import { fetchNeedsReview } from "@/lib/fetch-needs-review";
import { fetchTenantSignals } from "@/lib/fetch-tenant-signals";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import {
  readStore,
  setConversationGroundTruth,
  setSignalActed,
  setSignalFeedback,
  writeStore,
} from "@/lib/store";

const SIGNAL_ID = "sig_aditya";
const CONV_ID = "conv_aditya";

function raceStore(overrides: Partial<StoreData> = {}): StoreData {
  return {
    tenant: {
      id: "tenant_demo",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    conversations: [
      {
        id: CONV_ID,
        tenantId: "tenant_demo",
        channel: "whatsapp",
        startedAt: "2026-09-27T12:00:00.000Z",
        messageIds: [],
        customerName: "Aditya Pawar",
      },
    ],
    messages: [],
    signals: [
      {
        id: SIGNAL_ID,
        tenantId: "tenant_demo",
        conversationId: CONV_ID,
        type: "lead",
        score: 0.8,
        confidence: 0.8,
        summary: "Buying intent",
        suggestedAction: "Call",
        evidence: ['quote: "I want to open an account"'],
        status: "new",
        createdAt: "2026-09-27T12:00:00.000Z",
      },
    ],
    supervisedActions: [],
    actionLogs: [],
    pilot: { baselineOpportunities: 0 },
    ...overrides,
  };
}

async function paintDuringFetch(
  view: "insights" | "eval",
  duringFetch: () => Promise<void>,
) {
  vi.mocked(fetchNeedsReview).mockImplementation(async () => {
    await duringFetch();
    return { ok: true, predictions: [] };
  });
  await PlatformPage({
    searchParams: Promise.resolve({ view }),
  });
}

describe("PlatformPage store race", () => {
  beforeEach(async () => {
    duringShowcase.current = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests")),
    );
    await writeStore(raceStore());
    vi.mocked(fetchTenantSignals).mockResolvedValue({
      ok: true,
      rows: [],
    });
    vi.mocked(fetchSignalScoreSafe).mockResolvedValue(null);
  });

  afterEach(() => {
    duringShowcase.current = null;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each(["insights", "eval"] as const)(
    "%s draft backfill keeps a Correct label saved during first paint",
    async (view) => {
      await paintDuringFetch(view, () =>
        setSignalFeedback(SIGNAL_ID, "correct", "kept"),
      );

      const after = await readStore();
      const signal = after.signals.find((item) => item.id === SIGNAL_ID);
      expect(signal?.feedback?.label).toBe("correct");
      expect(signal?.feedback?.note).toBe("kept");
      expect(
        after.supervisedActions?.some((action) => action.signalId === SIGNAL_ID),
      ).toBe(true);
    },
  );

  it("keeps Acted when the draft backfill overlaps the save", async () => {
    await paintDuringFetch("insights", async () => {
      await setSignalFeedback(SIGNAL_ID, "correct", "kept");
      await setSignalActed(SIGNAL_ID, true);
    });

    const after = await readStore();
    const signal = after.signals.find((item) => item.id === SIGNAL_ID);
    expect(signal?.status).toBe("acted");
    expect(signal?.feedback?.label).toBe("correct");
    expect(
      after.supervisedActions?.filter((action) => action.signalId === SIGNAL_ID),
    ).toHaveLength(1);
  });

  it("keeps ground truth when the draft backfill overlaps the save", async () => {
    await paintDuringFetch("insights", () =>
      setConversationGroundTruth(CONV_ID, "lead").then(() => undefined),
    );

    const after = await readStore();
    const signal = after.signals.find((item) => item.id === SIGNAL_ID);
    expect(
      after.conversations.find((conversation) => conversation.id === CONV_ID)
        ?.groundTruth,
    ).toBe("lead");
    expect(signal?.groundTruth).toBe("lead");
    expect(signal?.feedback).toBeUndefined();
    expect(
      after.supervisedActions?.some((action) => action.signalId === SIGNAL_ID),
    ).toBe(true);
  });

  it("keeps a Correct label saved while showcase chats are dropped", async () => {
    await writeStore(
      raceStore({
        conversations: [
          {
            id: "conv_rucha_patwardhan_12",
            tenantId: "tenant_demo",
            channel: "in_app_chat",
            startedAt: "2026-08-01T00:00:00.000Z",
            messageIds: [],
            customerName: "Rucha Patwardhan",
          },
          {
            id: CONV_ID,
            tenantId: "tenant_demo",
            channel: "whatsapp",
            startedAt: "2026-09-27T12:00:00.000Z",
            messageIds: [],
            customerName: "Aditya Pawar",
            sourceFile: "Zerodha_week_7_batch_01.json",
          },
        ],
        pilot: {
          baselineOpportunities: 0,
          lastUploadedFileName: "Zerodha_week_7_batch_01.json",
        },
      }),
    );
    duringShowcase.current = () =>
      setSignalFeedback(SIGNAL_ID, "correct", "kept");

    await paintDuringFetch("insights", async () => undefined);

    const after = await readStore();
    expect(
      after.conversations.some(
        (conversation) => conversation.id === "conv_rucha_patwardhan_12",
      ),
    ).toBe(false);
    const signal = after.signals.find((item) => item.id === SIGNAL_ID);
    expect(signal?.feedback?.label).toBe("correct");
    expect(signal?.feedback?.note).toBe("kept");
  });
});
