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

  it("forwards scoreFrom over env and omits keep-set ids when JSON has chats", async () => {
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
    expect(scoreSpy).toHaveBeenCalledWith("tenant_demo", undefined, {
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
      undefined,
      { dateFrom: "2026-08-07T12:00:00.000Z" }
    );
  });

  it("omits keep-set ids when JSON has chats and skips leftover overlay", async () => {
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
    expect(scoreSpy.mock.calls[0]?.[1]).toBeUndefined();
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
