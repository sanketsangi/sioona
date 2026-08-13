import { afterEach, describe, expect, it, vi } from "vitest";
import { computeEvalMetrics } from "./eval";
import {
  applyLlmSecondPass,
  isDetectLlmEnabled,
  runHybridDetection,
} from "./detect-llm";
import { loadTestingJsonEval } from "./testing-json-eval";
import type { Conversation, Message } from "./types";

afterEach(() => {
  vi.unstubAllEnvs();
});

const conv: Conversation = {
  id: "conv_close",
  tenantId: "tenant_demo",
  channel: "whatsapp",
  customerName: "Asha",
  startedAt: "2026-08-01T00:00:00.000Z",
  messageIds: ["m1"],
};

const messages: Message[] = [
  {
    id: "m1",
    conversationId: "conv_close",
    role: "customer",
    content: "I am thinking of closing my account and moving my portfolio.",
    timestamp: "2026-08-01T00:00:00.000Z",
  },
];

describe("isDetectLlmEnabled", () => {
  it("is off without DETECT_LLM and key", () => {
    vi.stubEnv("DETECT_LLM", "");
    vi.stubEnv("GROQ_API_KEY", "");
    expect(isDetectLlmEnabled()).toBe(false);
  });

  it("requires both flag and Groq key", () => {
    vi.stubEnv("DETECT_LLM", "1");
    vi.stubEnv("GROQ_API_KEY", "");
    expect(isDetectLlmEnabled()).toBe(false);
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    expect(isDetectLlmEnabled()).toBe(true);
  });
});

describe("applyLlmSecondPass", () => {
  it("does not call classifier when heuristics already fired", async () => {
    const classify = vi.fn();
    const heuristic = await runHybridDetection(
      [conv],
      messages,
      "tenant_demo"
    );
    expect(heuristic.signals.length).toBeGreaterThan(0);

    const { signals, llm } = await applyLlmSecondPass(
      [conv],
      messages,
      "tenant_demo",
      heuristic.signals,
      null,
      { classify }
    );

    expect(classify).not.toHaveBeenCalled();
    expect(signals).toEqual(heuristic.signals);
    expect(llm.candidates).toBe(0);
    expect(llm.added).toBe(0);
  });

  it("adds a grounded retention signal on a none heuristic miss", async () => {
    const quiet: Conversation = {
      ...conv,
      id: "conv_quiet",
    };
    const quietMsgs: Message[] = [
      {
        ...messages[0],
        conversationId: "conv_quiet",
        content:
          "Please send the monthly account statement to my email when you can.",
      },
    ];

    const { signals: heuristic } = await runHybridDetection(
      [quiet],
      quietMsgs,
      "tenant_demo"
    );
    expect(heuristic).toHaveLength(0);

    const { signals, llm } = await applyLlmSecondPass(
      [quiet],
      quietMsgs,
      "tenant_demo",
      heuristic,
      null,
      {
        classify: async () => ({
          type: "retention",
          confidence: 0.72,
          summary: "Asha is asking to close after a fee complaint.",
          quotes: ["Please send the monthly account statement to my email"],
        }),
      }
    );

    expect(llm.added).toBe(1);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("retention");
    expect(signals[0].id).toContain("_llm");
    expect(signals[0].evidence.some((e) => e.startsWith("quote: "))).toBe(true);
    expect(signals[0].evidence.some((e) => e.startsWith("llm: "))).toBe(true);
  });

  it("drops ungrounded quotes and rejects empty hallucinated hits", async () => {
    const quiet: Conversation = { ...conv, id: "conv_none" };
    const quietMsgs: Message[] = [
      {
        ...messages[0],
        conversationId: "conv_none",
        content: "Thanks, that otp worked and I am logged in now.",
      },
    ];

    const { signals } = await applyLlmSecondPass(
      [quiet],
      quietMsgs,
      "tenant_demo",
      [],
      null,
      {
        classify: async () => ({
          type: "lead",
          confidence: 0.9,
          summary: "x",
          quotes: ["I want to open a demat account today please"],
        }),
      }
    );

    expect(signals).toHaveLength(0);
  });

  it("treats none / low confidence as no signal", async () => {
    const quiet: Conversation = { ...conv, id: "conv_ops" };
    const quietMsgs: Message[] = [
      {
        ...messages[0],
        conversationId: "conv_ops",
        content: "Can you resend the login otp to my registered mobile?",
      },
    ];

    const nonePass = await applyLlmSecondPass(
      [quiet],
      quietMsgs,
      "tenant_demo",
      [],
      null,
      {
        classify: async () => ({
          type: "none",
          confidence: 0.9,
          summary: "Ops login help.",
          quotes: ["Can you resend the login otp to my registered mobile"],
        }),
      }
    );
    expect(nonePass.signals).toHaveLength(0);

    const weak = await applyLlmSecondPass(
      [quiet],
      quietMsgs,
      "tenant_demo",
      [],
      null,
      {
        classify: async () => ({
          type: "lead",
          confidence: 0.2,
          summary: "Maybe a lead but below threshold.",
          quotes: ["Can you resend the login otp to my registered mobile"],
        }),
      }
    );
    expect(weak.signals).toHaveLength(0);
  });
});

describe("testing.json hybrid vs heuristic", () => {
  it("injected oracle on misses lifts recall without new FPs", async () => {
    const heuristic = loadTestingJsonEval();
    const heuristicRecall = heuristic.metrics.labeledRecall ?? 0;
    const heuristicFp = heuristic.metrics.falsePositives;

    const { signals, llm } = await applyLlmSecondPass(
      heuristic.store.conversations,
      heuristic.store.messages,
      heuristic.store.tenant.id,
      heuristic.store.signals,
      null,
      {
        maxCalls: 100,
        classify: async ({ conversation, customerMessages }) => {
          const gt = conversation.groundTruth;
          if (!gt || gt === "none") {
            return {
              type: "none",
              confidence: 0,
              summary: "",
              quotes: [],
            };
          }
          const quote =
            customerMessages.find((m) => m.content.trim().length >= 8)
              ?.content ?? "";
          return {
            type: gt,
            confidence: 0.7,
            summary: `${conversation.customerName ?? "Customer"} shows ${gt} intent in this thread.`,
            quotes: quote ? [quote.slice(0, 120)] : [],
          };
        },
      }
    );

    const hybrid = computeEvalMetrics({
      ...heuristic.store,
      signals,
    });

    expect(llm.enabled).toBe(true);
    expect(llm.added).toBeGreaterThan(0);
    expect(hybrid.labeledRecall ?? 0).toBeGreaterThan(heuristicRecall);
    expect(hybrid.falsePositives).toBeLessThanOrEqual(heuristicFp);
  });
});
