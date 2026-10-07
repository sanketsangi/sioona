import { describe, expect, it } from "vitest";
import { parseOpenAiCompatibleUsage, UNKNOWN_USAGE } from "./usage";

describe("parseOpenAiCompatibleUsage", () => {
  it("reads Groq chat usage fields without adding cached or reasoning tokens twice", () => {
    expect(
      parseOpenAiCompatibleUsage({
        usage: {
          prompt_tokens: 120,
          completion_tokens: 40,
          prompt_tokens_details: { cached_tokens: 80 },
          completion_tokens_details: { reasoning_tokens: 12 },
        },
      })
    ).toEqual({
      status: "reported",
      inputTokens: 120,
      cachedInputTokens: 80,
      outputTokens: 40,
      reasoningTokens: 12,
    });
  });

  it("keeps a reported zero instead of treating it as missing", () => {
    expect(
      parseOpenAiCompatibleUsage({
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      })
    ).toEqual({
      status: "reported",
      inputTokens: 0,
      cachedInputTokens: null,
      outputTokens: 0,
      reasoningTokens: null,
    });
  });

  it("returns unknown and leaves incomplete or invalid counts null", () => {
    expect(parseOpenAiCompatibleUsage(null)).toEqual(UNKNOWN_USAGE);
    expect(parseOpenAiCompatibleUsage({})).toEqual(UNKNOWN_USAGE);
    expect(parseOpenAiCompatibleUsage({ usage: null })).toEqual(UNKNOWN_USAGE);
    expect(parseOpenAiCompatibleUsage({ usage: [] })).toEqual({
      status: "unknown",
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
    });
    expect(
      parseOpenAiCompatibleUsage({
        usage: {
          prompt_tokens: 10,
          completion_tokens: "4",
          prompt_tokens_details: { cached_tokens: -1 },
          completion_tokens_details: { reasoning_tokens: Number.NaN },
        },
      })
    ).toEqual({
      status: "unknown",
      inputTokens: 10,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
    });
    expect(
      parseOpenAiCompatibleUsage({
        usage: {
          prompt_tokens: Number.POSITIVE_INFINITY,
          completion_tokens: 3,
          prompt_tokens_details: "nope",
          completion_tokens_details: null,
        },
      })
    ).toEqual({
      status: "unknown",
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: 3,
      reasoningTokens: null,
    });
  });

  it("reports usage when only the optional detail counts are absent", () => {
    expect(
      parseOpenAiCompatibleUsage({
        usage: {
          prompt_tokens: 8,
          completion_tokens: 2,
          prompt_tokens_details: {},
        },
      })
    ).toEqual({
      status: "reported",
      inputTokens: 8,
      cachedInputTokens: null,
      outputTokens: 2,
      reasoningTokens: null,
    });
  });
});
