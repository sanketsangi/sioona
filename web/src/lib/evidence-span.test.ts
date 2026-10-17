import { describe, expect, it } from "vitest";
import { verifiedEvidenceSpan } from "./evidence-span";

describe("persisted evidence span", () => {
  it("accepts an exact persisted substring", () => {
    expect(verifiedEvidenceSpan("hello close account", { start: 6, end: 19, quote: "close account" })).toEqual({ start: 6, end: 19 });
  });
  it("rejects stale, out of bounds, and unverified offsets", () => {
    for (const span of [{ start: 6, end: 99, quote: "close" }, { start: 0, end: 5, quote: "other" }, { start: 0, end: 5 }, { start: -1, end: 5, quote: "hello" }]) {
      expect(verifiedEvidenceSpan("hello close account", span)).toBeNull();
    }
  });
  it("handles persisted unicode code-point offsets without splitting mixed scripts", () => {
    expect(verifiedEvidenceSpan("😀 बंद करें", { start: 2, end: 10, quote: "बंद करें" })).toEqual({ start: 3, end: 11 });
  });
});
