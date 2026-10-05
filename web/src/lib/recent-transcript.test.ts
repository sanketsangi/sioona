import { describe, expect, it } from "vitest";
import { recentCustomerTranscript } from "./recent-transcript";
import type { Message } from "./types";
const turns = (contents: string[]): Message[] => contents.map((content, index) => ({ id: `m${index}`, conversationId: "c", role: "customer", content, timestamp: "2026-10-01" }));

describe("recent complete transcript turns", () => {
  it("keeps late cancellation after a long buying conversation", () => {
    const last = "Cancel my account opening request. I am moving to another broker.";
    const result = recentCustomerTranscript(turns(["I want to open an account.", ...Array(100).fill("Please confirm the documentation details."), last]));
    expect(result.text.endsWith(last)).toBe(true);
    expect(result.text).not.toContain("I want to open an account.");
    expect(result.context.truncated).toBe(true);
    expect(result.context.tokenUpperBound).toBeLessThanOrEqual(result.context.tokenBudget);
    expect(result.context.omittedTurns + result.context.includedTurns).toBe(102);
  });
  it("keeps full multilingual turns and never slices through text", () => {
    const messages = turns(["Old turn that should be omitted", "खाता बंद करना है।", "Please transfer my holdings."]);
    const result = recentCustomerTranscript(messages, 90);
    expect(result.text).toBe("खाता बंद करना है।\nPlease transfer my holdings.");
    expect(result.context.omittedTurns).toBe(1);
  });
  it("fails explicitly when the latest turn cannot fit, rather than classifying earlier intent", () => {
    expect(() => recentCustomerTranscript(turns(["Open an account", "x".repeat(3000)]))).toThrow("Latest complete");
  });
});
