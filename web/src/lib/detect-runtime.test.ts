import { afterEach, expect, it, vi } from "vitest";
import { detectLlmPrimaryMaxCalls, detectProviderExecutionConfig } from "./detect-llm";

afterEach(() => vi.unstubAllEnvs());

it("uses the longer detection path even with a leftover Vercel flag", () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("DETECT_LLM_MAX_CALLS", "");
  expect(detectLlmPrimaryMaxCalls()).toBe(120);
  expect(detectProviderExecutionConfig()).toMatchObject({
    retryWaitCapMs: 20_000,
    hostedRetryPacing: false,
  });
  vi.stubEnv("DETECT_LLM_MAX_CALLS", "4");
  expect(detectLlmPrimaryMaxCalls()).toBe(4);
});
