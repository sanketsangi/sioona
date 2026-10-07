import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DETECT_LLM_MODEL,
  DETECT_PROMPT_VERSION,
  FALLBACK_DETECT_LLM_MODEL,
  resetGroqPaceForTests,
  runHybridDetection,
} from "@/lib/detect-llm";
import type { Conversation, Message, Signal } from "@/lib/types";

const TEXT = "I am closing my account and moving my portfolio.";
const QUOTE = "I am closing my account";
const FROZEN_AT = "2026-10-08T00:00:00.000Z";

const conversation: Conversation = {
  id: "conv_parity",
  tenantId: "tenant_parity",
  channel: "whatsapp",
  customerName: "Customer abcd1234",
  startedAt: "2026-08-01T00:00:00.000Z",
  messageIds: ["m_parity"],
};

const messages: Message[] = [
  {
    id: "m_parity",
    conversationId: "conv_parity",
    role: "customer",
    content: TEXT,
    timestamp: "2026-08-01T00:00:00.000Z",
  },
];

const FROZEN_EVIDENCE = [`quote: "${QUOTE}"`, `llm: ${DEFAULT_DETECT_LLM_MODEL}`];

const FROZEN_CONTEXT = {
  includedTurns: 1,
  omittedTurns: 0,
  truncated: false,
  tokenUpperBound: Buffer.byteLength(TEXT, "utf8"),
  tokenBudget: 2400,
  promptVersion: DETECT_PROMPT_VERSION,
  model: DEFAULT_DETECT_LLM_MODEL,
};

const FROZEN_SIGNAL = {
  id: "sig_conv_parity_retention_llm",
  tenantId: "tenant_parity",
  conversationId: "conv_parity",
  type: "retention",
  score: 0.91,
  confidence: 0.91,
  summary: "Customer will close the account.",
  suggestedAction:
    "Hi Customer abcd1234 — I saw your note about “I am closing my account”. I can look into this and call you today if helpful. When works for a quick chat?",
  evidence: FROZEN_EVIDENCE,
  status: "new",
  createdAt: FROZEN_AT,
  urgency: "high",
  detectionContext: FROZEN_CONTEXT,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetGroqPaceForTests();
});

describe("published detection parity", () => {
  it("keeps signals, evidence, and model/prompt provenance, adding only stage and route", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FROZEN_AT));
    vi.stubEnv("DETECT_LLM", "1");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("DETECT_LLM_PRIMARY", "1");
    vi.stubEnv("DETECT_LLM_MIN_INTERVAL_MS", "0");
    vi.stubEnv("DETECT_LLM_MODEL", DEFAULT_DETECT_LLM_MODEL);
    vi.stubEnv("DETECT_LLM_FALLBACK_MODEL", FALLBACK_DETECT_LLM_MODEL);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  signal: "retention_risk",
                  confidence: 0.91,
                  evidence: QUOTE,
                  reason: "Customer will close the account.",
                }),
              },
            },
          ],
        }),
      })
    );

    const { signals } = await runHybridDetection([conversation], messages, "tenant_parity");
    expect(signals).toHaveLength(1);
    const signal = signals[0] as Signal;
    const context = signal.detectionContext;
    expect(context?.stage).toBe("detect");
    expect(context?.routeVersion).toBe(
      `detect:primary:${DEFAULT_DETECT_LLM_MODEL}|${FALLBACK_DETECT_LLM_MODEL}`
    );
    const { stage, routeVersion, ...publishedContext } = context ?? {};
    expect(stage).toBe("detect");
    expect(routeVersion).toContain("primary");
    const published = { ...signal, detectionContext: publishedContext };
    expect(JSON.parse(JSON.stringify(published))).toEqual(FROZEN_SIGNAL);
    expect(published.evidence).toEqual(FROZEN_EVIDENCE);
    expect(publishedContext).toEqual(FROZEN_CONTEXT);
  });
});
