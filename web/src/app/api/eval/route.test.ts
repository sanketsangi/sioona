import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fetchSignalScore from "@/lib/fetch-signal-score";
import { readStore, resetStore } from "@/lib/store";
import { GET } from "./route";

const emptyWindowScore = {
  tenant_id: "tenant_demo",
  signal_score: null,
  reviewed_count: 0,
  correct_count: 0,
  incorrect_count: 0,
  partially_correct_count: 0,
  by_signal_type: [],
};

describe("GET /api/eval", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    vi.stubEnv("SIGNAL_SCORE_FROM", "");
    await resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards scoreFrom over env with the exact report corpus", async () => {
    vi.stubEnv("SIGNAL_SCORE_FROM", "2026-07-01T00:00:00.000Z");
    const scoreSpy = vi
      .spyOn(fetchSignalScore, "fetchSignalScoreSafe")
      .mockResolvedValue(emptyWindowScore);

    await readStore();
    const res = await GET(
      new Request("http://localhost/api/eval?scoreFrom=2026-08-01")
    );
    const body = (await res.json()) as {
      signalScoreSource: string;
      pilot: { goNoGo: string; reviewedCount: number; reviewPrecision: number | null };
    };

    expect(res.status).toBe(200);
    expect(scoreSpy).toHaveBeenCalledWith("tenant_demo", (await readStore()).conversations.map((chat) => chat.id), {
      dateFrom: "2026-08-01T00:00:00.000Z",
    });
    expect(body.signalScoreSource).toBe("backend");
    expect(body.pilot.goNoGo).toBe("insufficient_data");
    expect(body.pilot.reviewedCount).toBe(0);
    expect(body.pilot.reviewPrecision).toBeNull();
  });

  it("uses SIGNAL_SCORE_FROM when scoreFrom is omitted", async () => {
    vi.stubEnv("SIGNAL_SCORE_FROM", "2026-08-07T12:00:00.000Z");
    const scoreSpy = vi
      .spyOn(fetchSignalScore, "fetchSignalScoreSafe")
      .mockResolvedValue(emptyWindowScore);

    const res = await GET(new Request("http://localhost/api/eval"));
    expect(res.status).toBe(200);
    expect(scoreSpy).toHaveBeenCalledWith(
      "tenant_demo",
      (await readStore()).conversations.map((chat) => chat.id),
      { dateFrom: "2026-08-07T12:00:00.000Z" }
    );
  });

  it("uses the report corpus and skips leftover overlay", async () => {
    const hydrate = await import("@/lib/hydrate-conversations");
    const overlaySpy = vi
      .spyOn(hydrate, "fetchOverlayConversations")
      .mockResolvedValue({
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
    const scoreSpy = vi
      .spyOn(fetchSignalScore, "fetchSignalScoreSafe")
      .mockResolvedValue(emptyWindowScore);

    await readStore();
    const res = await GET(new Request("http://localhost/api/eval"));
    expect(res.status).toBe(200);
    expect(overlaySpy).not.toHaveBeenCalled();
    expect(scoreSpy.mock.calls[0]?.[1]).toEqual((await readStore()).conversations.map((chat) => chat.id));
  });

  it("passes the JSON keep-set when replaced=1", async () => {
    const scoreSpy = vi
      .spyOn(fetchSignalScore, "fetchSignalScoreSafe")
      .mockResolvedValue(emptyWindowScore);
    const store = await readStore();

    const res = await GET(
      new Request("http://localhost/api/eval?replaced=1")
    );
    expect(res.status).toBe(200);
    const ids = scoreSpy.mock.calls[0]?.[1];
    expect(Array.isArray(ids)).toBe(true);
    expect(ids?.length).toBeGreaterThan(0);
    expect(ids).toEqual(
      expect.arrayContaining(store.conversations.map((row) => row.id))
    );
  });

  it("falls back to json_legacy when FastAPI is unreachable", async () => {
    vi.spyOn(fetchSignalScore, "fetchSignalScoreSafe").mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/eval"));
    const body = (await res.json()) as { signalScoreSource: string };

    expect(res.status).toBe(200);
    expect(body.signalScoreSource).toBe("json_legacy");
  });
});

it("uses the same unfiltered corpus and window as the report, regardless of replaced", async () => {
  const { queryRevenueReport } = await import("@/lib/revenue-report-query");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("backend unavailable in tests")));
  vi.stubEnv("SIGNAL_SCORE_FROM", "");
  const store = await resetStore();
  const scoreSpy = vi.spyOn(fetchSignalScore, "fetchSignalScoreSafe").mockResolvedValue(emptyWindowScore);
  try {
    await queryRevenueReport(store, { scoreFrom: "2026-10-01", scoreTo: "2026-10-04" });
    const reportArgs = scoreSpy.mock.calls[0];
    for (const replaced of ["0", "1"]) {
      scoreSpy.mockClear();
      const response = await GET(new Request(`http://localhost/api/eval?replaced=${replaced}&scoreFrom=2026-10-01&scoreTo=2026-10-04`));
      expect(response.status).toBe(200);
      expect(scoreSpy.mock.calls[0]).toEqual(reportArgs);
    }
  } finally {
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  }
});

it("keeps dated fallback review counts aligned with the report when backend is unavailable", async () => {
  const { writeStore } = await import("@/lib/store");
  const { queryRevenueReport } = await import("@/lib/revenue-report-query");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("backend unavailable in tests")));
  vi.stubEnv("SIGNAL_SCORE_FROM", "");
  const store = await resetStore();
  vi.spyOn(fetchSignalScore, "fetchSignalScoreSafe").mockResolvedValue(null);
  store.signals = store.signals.map((signal, index) => ({ ...signal, outcome: undefined,
    feedback: index < 2 ? { label: "correct", reviewedAt: index === 0
      ? "2026-09-01T12:00:00Z" : "2026-10-02T12:00:00Z" } : undefined }));
  try {
    await writeStore(store);
    const { scopedStore } = await queryRevenueReport(store, { scoreFrom: "2026-10-01", scoreTo: "2026-10-04" });
    expect(scopedStore.signals.filter((signal) => signal.feedback)).toHaveLength(1);
    const response = await GET(new Request("http://localhost/api/eval?scoreFrom=2026-10-01&scoreTo=2026-10-04"));
    const body = await response.json();
    expect(body.signalScoreSource).toBe("json_legacy");
    expect(body.metrics.reviewedCount).toBe(1);
  } finally {
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  }
});
