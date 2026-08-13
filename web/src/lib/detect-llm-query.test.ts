import { describe, expect, it } from "vitest";
import {
  llmQueryExtras,
  parseLlmAddedParam,
  parseLlmFailedParam,
  parseLlmPassStats,
} from "./detect-llm-query";

describe("parseLlmPassStats", () => {
  it("parses a full payload", () => {
    expect(
      parseLlmPassStats({
        enabled: true,
        candidates: 12,
        attempted: 8,
        added: 3,
        failed: 1,
        skipped: 4,
      })
    ).toEqual({
      enabled: true,
      candidates: 12,
      attempted: 8,
      added: 3,
      failed: 1,
      skipped: 4,
    });
  });

  it("returns null for junk", () => {
    expect(parseLlmPassStats(null)).toBeNull();
    expect(parseLlmPassStats({ enabled: true })).toBeNull();
  });
});

describe("llmQueryExtras", () => {
  it("is empty when pass 2 is off", () => {
    expect(
      llmQueryExtras({
        enabled: false,
        candidates: 0,
        attempted: 0,
        added: 0,
        failed: 0,
        skipped: 0,
      })
    ).toEqual({ llmAdded: null, llmFailed: null });
  });

  it("sets added and failed when Groq ran", () => {
    expect(
      llmQueryExtras({
        enabled: true,
        candidates: 10,
        attempted: 8,
        added: 2,
        failed: 1,
        skipped: 2,
      })
    ).toEqual({ llmAdded: "2", llmFailed: "1" });
  });
});

describe("parse llm URL params", () => {
  it("parses added / failed", () => {
    expect(parseLlmAddedParam("3")).toBe(3);
    expect(parseLlmAddedParam("0")).toBe(0);
    expect(parseLlmFailedParam("2")).toBe(2);
    expect(parseLlmFailedParam(undefined)).toBe(0);
  });
});
