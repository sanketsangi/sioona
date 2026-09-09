import { describe, expect, it } from "vitest";
import { QUOTE_MAX, clipQuote } from "./clip-quote";

describe("clipQuote", () => {
  it("collapses whitespace and leaves short text intact", () => {
    expect(clipQuote("  hello   world  ")).toBe("hello world");
    expect(clipQuote("ok")).toBe("ok");
  });

  it("truncates to max with a unicode ellipsis", () => {
    const input = "a".repeat(QUOTE_MAX + 10);
    const clipped = clipQuote(input);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped.length).toBe(QUOTE_MAX);
    expect(clipped.slice(0, -1)).toBe("a".repeat(QUOTE_MAX - 1));
  });

  it("does not truncate when length equals max", () => {
    const input = "b".repeat(QUOTE_MAX);
    expect(clipQuote(input)).toBe(input);
  });
});
