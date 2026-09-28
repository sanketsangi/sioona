import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGroqDetectChatBody,
  DEFAULT_DETECT_LLM_MODEL,
  GROQ_CHAT_URL,
  SYSTEM_PROMPT,
} from "../../src/lib/detect-llm";
import SioonaGroqDetectProvider from "./provider";

const messages = [
  {
    role: "agent" as const,
    content: "I can open a billing ticket for the fee difference.",
  },
  {
    role: "customer" as const,
    content: "I am closing my account and moving my portfolio.",
  },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("buildGroqDetectChatBody", () => {
  it("matches the Detect v2 Groq request and drops agent lines", () => {
    vi.stubEnv("DETECT_LLM_MODEL", "");
    const body = buildGroqDetectChatBody({
      customerName: "Ananya Rao",
      channel: "chat",
      messages,
    });
    expect(body).toEqual({
      model: DEFAULT_DETECT_LLM_MODEL,
      temperature: 0,
      reasoning_effort: "none",
      reasoning_format: "hidden",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Classify this chat. Return the JSON object only.\n\nCustomer: Ananya Rao\nChannel: chat\n\nCustomer messages:\nI am closing my account and moving my portfolio.",
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("billing ticket");
    expect(JSON.stringify(body)).not.toContain("expected_signal");
  });

  it("returns null when the chat has no customer text", () => {
    expect(
      buildGroqDetectChatBody({
        messages: [{ role: "agent", content: "Hello" }],
      })
    ).toBeNull();
  });
});

describe("SioonaGroqDetectProvider", () => {
  it("posts the shared body and returns raw model JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                signal: "retention_risk",
                confidence: 0.86,
                evidence: "I am closing my account and moving my portfolio",
                next_action: "Trigger retention playbook",
                reason: "Customer will close the account.",
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SioonaGroqDetectProvider({
      env: { GROQ_API_KEY: "gsk_test", DETECT_LLM_MODEL: "qwen/test-model" },
    });
    const result = await provider.callApi("detect-v2", {
      vars: {
        customer_name: "Ananya Rao",
        channel: "chat",
        expected_signal: "retention_risk",
        messages,
      },
    });

    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.output ?? "")).toMatchObject({
      signal: "retention_risk",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      GROQ_CHAT_URL,
      expect.objectContaining({ method: "POST" })
    );
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      model: string;
      messages: Array<{ content: string }>;
    };
    expect(sent.model).toBe("qwen/test-model");
    expect(sent.messages[1].content).not.toContain("retention_risk");
    expect(sent.messages[1].content).not.toContain("billing ticket");
  });

  it("names a missing Groq key instead of calling the API", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new SioonaGroqDetectProvider();
    const result = await provider.callApi("detect-v2", {
      vars: { messages },
    });
    expect(result.error).toContain("GROQ_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
