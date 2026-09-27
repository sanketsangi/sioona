import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import * as detectLlm from "@/lib/detect-llm";
import { readStore, resetStore, setSignalFeedback, writeStore } from "@/lib/store";
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

  it("classifies the stored skip list and keeps the chats still waiting", async () => {
    const before = await readStore();
    before.llmSkippedConversationIds = ["conv_skip_a", "conv_skip_b"];
    await writeStore(before);

    const detectSpy = vi
      .spyOn(detectLlm, "runHybridDetection")
      .mockResolvedValue({
        signals: before.signals,
        llm: {
          enabled: true,
          candidates: 10,
          attempted: 8,
          added: 0,
          failed: 0,
          skipped: 2,
          skippedIds: ["conv_skip_c"],
        },
      });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(detectSpy).toHaveBeenCalledWith(
      before.conversations,
      before.messages,
      before.tenant.id,
      before.taxonomyOverrides,
      { resumeIds: ["conv_skip_a", "conv_skip_b"] }
    );

    const after = await readStore();
    expect(after.llmSkippedConversationIds).toEqual(["conv_skip_c"]);
  });
});
