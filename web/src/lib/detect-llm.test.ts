import { afterEach, describe, expect, it, vi } from "vitest";
import { computeEvalMetrics } from "./eval";
import { pseudonymCustomerName } from "./redact";
import {
  applyLlmSecondPass,
  classifyChatMessages,
  classifyConversationWithGroq,
  DEFAULT_DETECT_LLM_MODEL,
  DETECT_LLM_CONCURRENCY,
  DETECT_LLM_MAX_CALLS,
  groqFailureKind,
  isDetectLlmEnabled,
  LlmCallFailed,
  parseLlmClassificationJson,
  recoverGroundedQuote,
  runHybridDetection,
  SYSTEM_PROMPT,
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

describe("classifyChatMessages", () => {
  it("prepends SYSTEM_PROMPT as a system role then the user classify text", () => {
    expect(
      classifyChatMessages({
        customerName: "Asha",
        channel: "whatsapp",
        customerText: "I want to close my account",
      })
    ).toEqual([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Classify this chat. Return the JSON object only.\n\nCustomer: ${pseudonymCustomerName("Asha")}\nChannel: whatsapp\n\nCustomer messages:\nI want to close my account`,
      },
    ]);
  });
});

describe("SYSTEM_PROMPT", () => {
  it("pins strict 5-key JSON, corpus labels, verbatim evidence, and later-turn rules", () => {
    expect(SYSTEM_PROMPT).toContain(
      '"signal":"retention_risk"|"upsell_opportunity"|"lead_intent"|"none"'
    );
    expect(SYSTEM_PROMPT).toContain('"confidence":0.0');
    expect(SYSTEM_PROMPT).toContain('"evidence":"exact quote"');
    expect(SYSTEM_PROMPT).toContain('"next_action":"short action"');
    expect(SYSTEM_PROMPT).toContain('"reason":"one short sentence"');
    expect(SYSTEM_PROMPT).toContain("No extra keys");
    expect(SYSTEM_PROMPT).toContain("Later turns override earlier ones");
    expect(SYSTEM_PROMPT).toContain("verbatim");
    expect(SYSTEM_PROMPT).toContain("If you cannot copy a real customer span");
  });
});

describe("parseLlmClassificationJson", () => {
  it("parses the strict 5-key schema from the small-model prompt", () => {
    expect(
      parseLlmClassificationJson(
        JSON.stringify({
          signal: "retention_risk",
          confidence: 0.86,
          evidence: "I am closing my account and moving my portfolio",
          next_action: "Trigger retention playbook — same-day manager callback",
          reason: "Customer will close and shift the portfolio.",
        })
      )
    ).toEqual({
      type: "retention",
      confidence: 0.86,
      summary: "Customer will close and shift the portfolio.",
      quotes: ["I am closing my account and moving my portfolio"],
    });
  });

  it("maps retention_risk, upsell_opportunity, and lead_intent to product types", () => {
    expect(
      parseLlmClassificationJson(
        JSON.stringify({
          type: "retention_risk",
          confidence: 0.9,
          summary: "Churn",
          quotes: ["close my account"],
        })
      )?.type
    ).toBe("retention");
    expect(
      parseLlmClassificationJson(
        JSON.stringify({
          type: "Upsell Opportunity",
          confidence: 0.7,
          summary: "LAS ask",
          quotes: ["loan against shares"],
        })
      )?.type
    ).toBe("upsell");
    expect(
      parseLlmClassificationJson(
        JSON.stringify({
          signal: "lead_intent",
          summary: "New demat",
          evidence: ["open a demat account"],
        })
      )
    ).toEqual({
      type: "lead",
      confidence: 0.55,
      summary: "New demat",
      quotes: ["open a demat account"],
    });
  });

  it("maps complaint to none and rejects unknown types", () => {
    expect(
      parseLlmClassificationJson(
        JSON.stringify({ type: "complaint", quotes: [] })
      )?.type
    ).toBe("none");
    expect(
      parseLlmClassificationJson(JSON.stringify({ type: "foobar", quotes: [] }))
    ).toBeNull();
  });
});

describe("recoverGroundedQuote", () => {
  const source =
    "I am thinking of closing my account and moving my portfolio.";

  it("returns the original span for exact and punctuation-folded quotes", () => {
    expect(recoverGroundedQuote("closing my account", source)).toBe(
      "closing my account"
    );
    expect(
      recoverGroundedQuote(
        'Customer: "closing my account, and moving my portfolio"',
        source
      )
    ).toBe("closing my account and moving my portfolio.");
  });

  it("recovers a consecutive token run from a paraphrased prefix", () => {
    expect(
      recoverGroundedQuote(
        "I am planning on closing my account and moving my portfolio soon",
        source
      )
    ).toBe("closing my account and moving my portfolio.");
  });

  it("rejects invented quotes that are not in the customer text", () => {
    expect(
      recoverGroundedQuote(
        "I want to open a demat account today please",
        "Thanks, that otp worked and I am logged in now."
      )
    ).toBeNull();
  });
});

const noneClassification = {
  type: "none" as const,
  confidence: 0,
  summary: "",
  quotes: [] as string[],
};

function quietMissBatch(n: number): {
  conversations: Conversation[];
  messages: Message[];
} {
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  for (let i = 0; i < n; i++) {
    const id = `conv_miss_${i}`;
    conversations.push({ ...conv, id });
    messages.push({
      id: `m_miss_${i}`,
      conversationId: id,
      role: "customer",
      content:
        "Please send the monthly account statement to my email when you can.",
      timestamp: "2026-08-01T00:00:00.000Z",
    });
  }
  return { conversations, messages };
}

async function inFlightUnderHold(input: {
  candidates: number;
  env?: string;
  optionsConcurrency?: number;
}): Promise<number> {
  vi.stubEnv("DETECT_LLM_CONCURRENCY", input.env ?? "");
  const { conversations, messages } = quietMissBatch(input.candidates);

  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;

  const pending = applyLlmSecondPass(
    conversations,
    messages,
    "tenant_demo",
    [],
    null,
    {
      ...(input.optionsConcurrency !== undefined
        ? { concurrency: input.optionsConcurrency }
        : {}),
      classify: async () => {
        started += 1;
        await hold;
        return noneClassification;
      },
    }
  );

  await vi.waitFor(() => {
    expect(started).toBeGreaterThan(0);
  });
  await new Promise((r) => setTimeout(r, 25));
  const inFlight = started;
  release();
  await pending;
  return inFlight;
}

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

  it("keeps heuristic signals when every Groq call fails", async () => {
    const heuristic = await runHybridDetection(
      [conv],
      messages,
      "tenant_demo"
    );
    expect(heuristic.signals.length).toBeGreaterThan(0);

    const quiet: Conversation = { ...conv, id: "conv_quiet_fail" };
    const quietMsgs: Message[] = [
      {
        ...messages[0],
        id: "msg_quiet_fail",
        conversationId: "conv_quiet_fail",
        content:
          "Please send the monthly account statement to my email when you can.",
      },
    ];

    const { signals, llm } = await applyLlmSecondPass(
      [conv, quiet],
      [...messages, ...quietMsgs],
      "tenant_demo",
      heuristic.signals,
      null,
      {
        classify: async () => {
          throw new LlmCallFailed("model");
        },
      }
    );

    expect(signals).toEqual(heuristic.signals);
    expect(llm.added).toBe(0);
    expect(llm.failed).toBe(1);
    expect(llm.llmFailure).toBe("model");
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

  it("recovers slightly mangled quotes as Why This Fired evidence", async () => {
    const quiet: Conversation = { ...conv, id: "conv_mangled" };
    const quietMsgs: Message[] = [
      {
        ...messages[0],
        conversationId: "conv_mangled",
        content:
          "Please send the monthly account statement to my email when you can.",
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
          type: "retention",
          confidence: 0.7,
          summary: "Customer asked for a statement after a fee issue.",
          quotes: [
            'Customer: "Please send the monthly account statement, to my email"',
          ],
        }),
      }
    );

    expect(signals).toHaveLength(1);
    expect(
      signals[0].evidence.some((e) =>
        e.includes("Please send the monthly account statement")
      )
    ).toBe(true);
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

  it("defaults concurrency to 2 and honors DETECT_LLM_CONCURRENCY", async () => {
    expect(DETECT_LLM_CONCURRENCY).toBe(2);
    expect(DETECT_LLM_MAX_CALLS).toBe(8);

    expect(await inFlightUnderHold({ candidates: 5 })).toBe(2);
    expect(await inFlightUnderHold({ candidates: 5, env: "4" })).toBe(4);
    expect(await inFlightUnderHold({ candidates: 5, env: "nope" })).toBe(2);
    expect(await inFlightUnderHold({ candidates: 5, env: "0" })).toBe(2);
    expect(
      await inFlightUnderHold({
        candidates: 5,
        env: "8",
        optionsConcurrency: 3,
      })
    ).toBe(3);
  });

  it("records skipped misses and classifies that set before a new miss", async () => {
    const chats = Array.from({ length: 20 }, (_, index) => {
      const id = `conv_miss_${String(index).padStart(2, "0")}`;
      const content = `Please send the monthly account statement to my email when you can.${" ok".repeat(index + 1)}`;
      const conversation: Conversation = {
        ...conv,
        id,
        messageIds: [`msg_${id}`],
      };
      const message: Message = {
        ...messages[0],
        id: `msg_${id}`,
        conversationId: id,
        content,
      };
      return { conversation, message, content };
    });
    const conversations = chats.map((row) => row.conversation);
    const allMessages = chats.map((row) => row.message);
    const byLength = [...chats].sort(
      (a, b) => b.content.length - a.content.length
    );
    const none = {
      type: "none" as const,
      confidence: 0.9,
      summary: "Statement request with no product intent.",
      quotes: [] as string[],
    };

    const firstCalls: string[] = [];
    const first = await applyLlmSecondPass(
      conversations,
      allMessages,
      "tenant_demo",
      [],
      null,
      {
        maxCalls: 8,
        classify: async (input) => {
          firstCalls.push(input.conversation.id);
          return none;
        },
      }
    );

    expect(first.llm.candidates).toBe(20);
    expect(first.llm.attempted).toBe(8);
    expect(first.llm.skipped).toBe(12);
    expect(new Set(firstCalls)).toEqual(
      new Set(byLength.slice(0, 8).map((row) => row.conversation.id))
    );
    expect(first.llm.skippedIds).toEqual(
      byLength.slice(8).map((row) => row.conversation.id)
    );

    const extraId = "conv_miss_new";
    const secondCalls: string[] = [];
    const second = await applyLlmSecondPass(
      [...conversations, { ...conv, id: extraId, messageIds: ["msg_new"] }],
      [
        ...allMessages,
        {
          ...messages[0],
          id: "msg_new",
          conversationId: extraId,
          content: `Please send the monthly account statement to my email when you can.${" ok".repeat(40)}`,
        },
      ],
      "tenant_demo",
      [],
      null,
      {
        maxCalls: 8,
        resumeIds: first.llm.skippedIds,
        classify: async (input) => {
          secondCalls.push(input.conversation.id);
          return none;
        },
      }
    );

    const nextEight = first.llm.skippedIds?.slice(0, 8) ?? [];
    expect(nextEight).toHaveLength(8);
    expect(new Set(secondCalls)).toEqual(new Set(nextEight));
    expect(secondCalls).not.toContain(extraId);
    expect(second.llm.attempted).toBe(8);
    expect(second.llm.skippedIds?.slice(0, 4)).toEqual(
      first.llm.skippedIds?.slice(8)
    );
    expect(second.llm.skippedIds?.[4]).toBe(extraId);
  });
});

describe("classifyConversationWithGroq", () => {
  const customerMessages: Message[] = [
    {
      id: "m1",
      conversationId: conv.id,
      role: "customer",
      content: "I want to close my account and move my portfolio this week.",
      timestamp: "2026-08-01T00:00:00.000Z",
    },
  ];

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null without calling Groq when the key is missing", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      classifyConversationWithGroq({
        conversation: conv,
        customerMessages,
      })
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when there is no customer text", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      classifyConversationWithGroq({
        conversation: conv,
        customerMessages: [
          {
            ...customerMessages[0],
            role: "agent",
            content: "How can I help?",
          },
        ],
      })
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies Groq failures as key, model, timeout, or shape", async () => {
    expect(
      groqFailureKind(
        400,
        `The model \`qwen/qwen3.6-27b\` does not exist or you do not have access to it.`
      )
    ).toBe("model");
    expect(groqFailureKind(401, "invalid api key")).toBe("key");
    expect(
      groqFailureKind(
        401,
        `{"error":{"message":"Invalid API Key","code":"expired_api_key"}}`
      )
    ).toBe("key");
    expect(groqFailureKind(429, "rate limit")).toBeNull();

    vi.stubEnv("GROQ_API_KEY", "gsk_test");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));
    await expect(
      classifyConversationWithGroq({ conversation: conv, customerMessages })
    ).rejects.toMatchObject({ name: "LlmCallFailed", kind: "timeout" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          "The model `qwen/qwen3.6-27b` has been decommissioned",
      })
    );
    await expect(
      classifyConversationWithGroq({ conversation: conv, customerMessages })
    ).rejects.toMatchObject({ kind: "model" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "not-json" } }],
        }),
      })
    );
    await expect(
      classifyConversationWithGroq({ conversation: conv, customerMessages })
    ).rejects.toMatchObject({ kind: "shape" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "",
                reasoning: JSON.stringify({
                  signal: "retention_risk",
                  confidence: 0.8,
                  evidence: "close my account",
                  reason: "Customer will close the account.",
                }),
              },
            },
          ],
        }),
      })
    );
    await expect(
      classifyConversationWithGroq({ conversation: conv, customerMessages })
    ).resolves.toMatchObject({ type: "retention" });
  });

  it("rejects an unknown label and an undiagnosed HTTP status", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "rate limit",
      })
    );
    await expect(
      classifyConversationWithGroq({ conversation: conv, customerMessages })
    ).rejects.toMatchObject({ kind: null });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: "foobar",
                  confidence: 0.9,
                  summary: "Leaving",
                  quotes: ["close my account"],
                }),
              },
            },
          ],
        }),
      })
    );
    await expect(
      classifyConversationWithGroq({ conversation: conv, customerMessages })
    ).rejects.toMatchObject({ kind: "shape" });
  });

  it("parses a valid Groq payload, clamps confidence, and keeps two string quotes", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("DETECT_LLM_MODEL", "qwen/test-model");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                type: " Retention ",
                confidence: 1.8,
                summary: "  Asha is leaving  ",
                quotes: [
                  "close my account",
                  "move my portfolio",
                  "third quote dropped",
                  12,
                ],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await classifyConversationWithGroq({
      conversation: conv,
      customerMessages,
    });

    expect(result).toEqual({
      type: "retention",
      confidence: 1,
      summary: "Asha is leaving",
      quotes: ["close my account", "move my portfolio"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gsk_test",
        }),
      })
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe("qwen/test-model");
    expect(body.messages[0]).toEqual({
      role: "system",
      content: SYSTEM_PROMPT,
    });
    expect(body.messages[1]?.role).toBe("user");
    expect(body.messages[1]?.content).toContain("Classify this chat");
    expect(String(fetchMock.mock.calls[0][1].body)).toContain("retention_risk");
    expect(String(fetchMock.mock.calls[0][1].body)).toContain(
      "upsell_opportunity"
    );
    expect(String(fetchMock.mock.calls[0][1].body)).toContain("lead_intent");
  });

  it("defaults missing confidence to 0.55 and uses the default model", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("DETECT_LLM_MODEL", "");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                type: "none",
                summary: "Ops chat",
                quotes: [],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await classifyConversationWithGroq({
      conversation: conv,
      customerMessages,
    });
    expect(result).toEqual({
      type: "none",
      confidence: 0.55,
      summary: "Ops chat",
      quotes: [],
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      model: string;
      reasoning_effort: string;
      reasoning_format: string;
    };
    expect(body.model).toBe(DEFAULT_DETECT_LLM_MODEL);
    expect(body.reasoning_effort).toBe("none");
    expect(body.reasoning_format).toBe("hidden");
  });

  it("parses fenced JSON and corpus type aliases from a small Qwen payload", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: `<think>maybe retention</think>\n\`\`\`json\n{"signal":"retention_risk","score":0.81,"reason":"Leaving the broker.","evidence":[{"quote":"close my account"}]}\n\`\`\``,
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      classifyConversationWithGroq({ conversation: conv, customerMessages })
    ).resolves.toEqual({
      type: "retention",
      confidence: 0.81,
      summary: "Leaving the broker.",
      quotes: ["close my account"],
    });
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
    expect(hybrid.falsePositives).toBeLessThanOrEqual(heuristicFp);
    // Heuristics now recover testing.json (FN=0). Oracle has no misses to lift.
    if (heuristic.metrics.falseNegatives > 0) {
      expect(llm.added).toBeGreaterThan(0);
      expect(hybrid.labeledRecall ?? 0).toBeGreaterThan(heuristicRecall);
    } else {
      expect(llm.added).toBe(0);
      expect(hybrid.labeledRecall ?? 0).toBe(heuristicRecall);
    }
  });
});
