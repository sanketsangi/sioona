import { afterEach, expect, it, vi } from "vitest";
import { detectionExecution, assertInlineDetection } from "./detection-execution";
import { postGroqChatCompletion } from "./ai/providers/groq";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("defaults to inline and rejects ambiguous cutover", () => {
  vi.stubEnv("SIOONA_DETECTION_EXECUTION", "");
  expect(detectionExecution()).toBe("inline");
  vi.stubEnv("SIOONA_DETECTION_EXECUTION", "workers");
  expect(detectionExecution).toThrow("Invalid");
  vi.stubEnv("SIOONA_DETECTION_EXECUTION", "worker");
  vi.stubEnv("SIOONA_STATE_MODE", "json-demo");
  expect(detectionExecution).toThrow("Postgres");
});
it("blocks the provider boundary even from an after callback", async () => {
  vi.stubEnv("SIOONA_DETECTION_EXECUTION", "worker");
  vi.stubEnv("SIOONA_STATE_MODE", "postgres");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect(assertInlineDetection).toThrow("background worker");
  await expect(postGroqChatCompletion({ apiKey: "test-only", model: "qwen/test", messages: [], timeoutMs: 5 })).rejects.toThrow("background worker");
  expect(fetch).not.toHaveBeenCalled();
});
