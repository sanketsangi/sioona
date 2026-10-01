import { describe, expect, it } from "vitest";
import { runDetection } from "./detect";
import { applyLlmPrimaryPass } from "./detect-llm";
import type { Conversation, Message, SignalType } from "./types";

type Expected = SignalType | "none";

const CASES: { id: string; text: string; expected: Expected }[] = [
  {
    id: "h_shift",
    text: "Bhai paisa nikalna hai, Zerodha pe shift kar raha hoon.",
    expected: "retention",
  },
  {
    id: "h_band",
    text: "Withdrawal fail ho gaya. Account band karna hai is hafte.",
    expected: "retention",
  },
  {
    id: "h_demat",
    text: "Naya demat kholna hai. Brokerage kitni padegi?",
    expected: "lead",
  },
  {
    id: "h_las",
    text: "Existing account hai. Mutual fund aur loan against shares chahiye.",
    expected: "upsell",
  },
  {
    id: "h_statement",
    text: "Statement bhej do please, last month ka PDF.",
    expected: "none",
  },
];

function chats(): { conversations: Conversation[]; messages: Message[] } {
  const conversations: Conversation[] = CASES.map((row) => ({
    id: row.id,
    tenantId: "tenant_demo",
    channel: "whatsapp",
    customerName: "Customer",
    startedAt: "2026-10-01T00:00:00.000Z",
    messageIds: [`m_${row.id}`],
    groundTruth: row.expected,
  }));
  const messages: Message[] = CASES.map((row) => ({
    id: `m_${row.id}`,
    conversationId: row.id,
    role: "customer",
    content: row.text,
    timestamp: "2026-10-01T00:00:00.000Z",
  }));
  return { conversations, messages };
}

function score(
  predicted: Map<string, SignalType | "none">
): { precision: number; recall: number; tp: number; fp: number; fn: number } {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const row of CASES) {
    const got = predicted.get(row.id) ?? "none";
    if (row.expected === "none") {
      if (got !== "none") fp += 1;
      continue;
    }
    if (got === row.expected) tp += 1;
    else {
      fn += 1;
      if (got !== "none") fp += 1;
    }
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { precision, recall, tp, fp, fn };
}

function predictedTypes(
  signals: { conversationId: string; type: SignalType }[]
): Map<string, SignalType | "none"> {
  const map = new Map<string, SignalType | "none">();
  for (const row of CASES) map.set(row.id, "none");
  for (const signal of signals) {
    if (!map.has(signal.conversationId)) continue;
    if (map.get(signal.conversationId) === "none") {
      map.set(signal.conversationId, signal.type);
    }
  }
  return map;
}

describe("Hinglish detection before and after LLM-first", () => {
  it("raises recall when the model is the classifier and quotes stay grounded", async () => {
    const { conversations, messages } = chats();
    const heuristic = runDetection(conversations, messages, "tenant_demo");
    const before = score(predictedTypes(heuristic));

    const { signals } = await applyLlmPrimaryPass(
      conversations,
      messages,
      "tenant_demo",
      heuristic,
      null,
      {
        maxCalls: CASES.length,
        classify: async (input) => {
          const row = CASES.find((item) => item.id === input.conversation.id);
          if (!row || row.expected === "none") {
            return {
              type: "none",
              confidence: 0.9,
              summary: "No product intent.",
              quotes: [],
            };
          }
          return {
            type: row.expected,
            confidence: 0.86,
            summary: "Hinglish product intent.",
            quotes: [row.text],
          };
        },
      }
    );
    const after = score(predictedTypes(signals));

    expect(before).toEqual({ precision: 1, recall: 0.25, tp: 1, fp: 0, fn: 3 });
    expect(after).toEqual({ precision: 1, recall: 1, tp: 4, fp: 0, fn: 0 });
    expect(after.recall).toBeGreaterThan(before.recall);
    expect(signals.every((signal) => signal.evidence.some((line) => line.startsWith("quote:")))).toBe(
      true
    );
  });

  it("keeps the heuristic hit when the model call fails", async () => {
    const { conversations, messages } = chats();
    const heuristic = runDetection(conversations, messages, "tenant_demo");
    const { signals, llm } = await applyLlmPrimaryPass(
      conversations,
      messages,
      "tenant_demo",
      heuristic,
      null,
      {
        classify: async () => {
          throw new Error("groq down");
        },
      }
    );
    expect(llm.failed).toBe(CASES.length);
    expect(signals).toEqual(heuristic);
  });

  it("resumes chats the previous run skipped", async () => {
    const { conversations, messages } = chats();
    const first = await applyLlmPrimaryPass(
      conversations,
      messages,
      "tenant_demo",
      [],
      null,
      {
        maxCalls: 2,
        classify: async () => ({
          type: "none",
          confidence: 0.9,
          summary: "none",
          quotes: [],
        }),
      }
    );
    expect(first.llm.attempted).toBe(2);
    expect(first.llm.skipped).toBe(CASES.length - 2);
    const seen = new Set<string>();
    const second = await applyLlmPrimaryPass(
      conversations,
      messages,
      "tenant_demo",
      [],
      null,
      {
        maxCalls: 2,
        resumeIds: first.llm.skippedIds,
        classify: async (input) => {
          seen.add(input.conversation.id);
          return {
            type: "none",
            confidence: 0.9,
            summary: "none",
            quotes: [],
          };
        },
      }
    );
    expect(second.llm.attempted).toBe(2);
    for (const id of first.llm.skippedIds?.slice(0, 2) ?? []) {
      expect(seen.has(id)).toBe(true);
    }
  });
});
