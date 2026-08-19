import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { readStore, resetStore, setSignalFeedback } from "@/lib/store";
import * as syncPredictions from "@/lib/sync-predictions";

describe("POST /api/detect", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    vi.stubEnv("DETECT_LLM", "");
    vi.stubEnv("GROQ_API_KEY", "");
    await resetStore();
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("re-detects, keeps SignalScore feedback, and reports sync stats", async () => {
    const before = await readStore();
    const target = before.signals[0];
    expect(target).toBeTruthy();
    await setSignalFeedback(target.id, "correct", "keep me");

    const res = await POST();
    const body = (await res.json()) as {
      count: number;
      signals: { id: string; conversationId: string; type: string }[];
      predictionSync: { attempted: number; failed: number };
      detectLlm: { enabled: boolean };
    };

    expect(res.status).toBe(200);
    expect(body.count).toBe(body.signals.length);
    expect(body.count).toBeGreaterThan(0);
    expect(body.detectLlm.enabled).toBe(false);
    expect(body.predictionSync.attempted).toBe(body.count);
    expect(body.predictionSync.failed).toBe(0);

    const after = await readStore();
    const persisted = after.signals.find(
      (s) => s.conversationId === target.conversationId && s.type === target.type
    );
    expect(persisted?.feedback?.label).toBe("correct");
    expect(persisted?.feedback?.note).toBe("keep me");
  });
});
