import type { Message } from "./types";

export type TranscriptContext = {
  includedTurns: number;
  omittedTurns: number;
  truncated: boolean;
  /** Conservative token upper bound: at most one token per UTF-8 byte. */
  tokenUpperBound: number;
  tokenBudget: number;
};

/** Keep a contiguous suffix of complete customer turns; never cut off final intent. */
export function recentCustomerTranscript(messages: Message[], tokenBudget = 2400): {
  text: string; context: TranscriptContext;
} {
  if (!Number.isInteger(tokenBudget) || tokenBudget <= 0) throw new Error("Invalid transcript token budget");
  const turns = messages.filter((message) => message.role === "customer")
    .map((message) => message.content.trim()).filter(Boolean);
  const selected: string[] = [];
  let tokens = 0;
  for (let index = turns.length - 1; index >= 0; index--) {
    const cost = Buffer.byteLength(turns[index], "utf8") + (selected.length ? 1 : 0);
    if (tokens + cost > tokenBudget) {
      if (selected.length === 0) throw new Error("Latest complete customer turn exceeds transcript token budget");
      break;
    }
    selected.unshift(turns[index]);
    tokens += cost;
  }
  return { text: selected.join("\n"), context: {
    includedTurns: selected.length, omittedTurns: turns.length - selected.length,
    truncated: selected.length < turns.length, tokenUpperBound: tokens, tokenBudget,
  } };
}
