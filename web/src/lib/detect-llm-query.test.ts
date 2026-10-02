import { describe, expect, it } from "vitest";
import {
  llmQueryExtras,
  llmPassFailureNotice,
  llmSkipResumeNotice,
  parseLlmAddedParam,
  parseLlmFailedParam,
  parseLlmFailureParam,
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
    ).toEqual({ llmAdded: null, llmFailed: null, llmFailure: null });
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
    ).toEqual({ llmAdded: "2", llmFailed: "1", llmFailure: null });
  });

  it("reads llmFailure and the legacy failure field", () => {
    expect(
      parseLlmPassStats({
        enabled: true,
        candidates: 81,
        attempted: 4,
        added: 0,
        failed: 4,
        skipped: 77,
        llmFailure: "key",
      })?.llmFailure
    ).toBe("key");
    expect(
      parseLlmPassStats({
        enabled: true,
        candidates: 81,
        attempted: 4,
        added: 0,
        failed: 4,
        skipped: 77,
        failure: "model",
      })?.llmFailure
    ).toBe("model");
    expect(
      llmQueryExtras({
        enabled: true,
        candidates: 81,
        attempted: 4,
        added: 0,
        failed: 4,
        skipped: 77,
        llmFailure: "key",
      }).llmFailure
    ).toBe("key");
  });
});

describe("parse llm URL params", () => {
  it("parses added / failed", () => {
    expect(parseLlmAddedParam("3")).toBe(3);
    expect(parseLlmAddedParam("0")).toBe(0);
    expect(parseLlmFailedParam("2")).toBe(2);
    expect(parseLlmFailedParam(undefined)).toBe(0);
    expect(parseLlmFailureParam("model")).toBe("model");
    expect(parseLlmFailureParam("nope")).toBeNull();
  });
});

describe("llmPassFailureNotice", () => {
  it("names a used-up daily token limit", () => {
    expect(
      llmPassFailureNotice({
        failed: 18,
        failure: "quota",
        signalCount: 10,
      })
    ).toEqual({
      title: "Second pass failed",
      description:
        "Groq’s daily token limit for this model is used up. 18 second-pass calls failed. 10 signals from the first pass are still in the queue.",
    });
  });

  it("names the model failure and keeps the first-pass count", () => {
    expect(
      llmPassFailureNotice({
        failed: 4,
        failure: "model",
        signalCount: 19,
      })
    ).toEqual({
      title: "Second pass failed",
      description:
        "Groq no longer serves this model. 4 second-pass calls failed. 19 signals from the first pass are still in the queue.",
    });
  });

  it("does not claim the queue holds signals while the export is still opening", () => {
    expect(
      llmPassFailureNotice({
        failed: 4,
        failure: null,
        signalCount: 10,
        inQueue: false,
      }),
    ).toEqual({
      title: "Second pass failed",
      description:
        "The second pass failed. 4 second-pass calls failed. 10 signals from the first pass are saved. They show up when this export finishes opening.",
    });
  });
});

describe("llmSkipResumeNotice", () => {
  it("names the next batch of skipped chats", () => {
    expect(llmSkipResumeNotice(12, 8)).toEqual({
      title: "Second pass has more chats",
      description:
        "12 chats were not classified. Re-run Detection classifies the next 8.",
    });
    expect(llmSkipResumeNotice(3, 8)?.description).toBe(
      "3 chats were not classified. Re-run Detection classifies those chats next."
    );
    expect(llmSkipResumeNotice(0, 8)).toBeNull();
  });
});
