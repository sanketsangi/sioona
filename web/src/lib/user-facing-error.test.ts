import { describe, expect, it } from "vitest";
import {
  humanizeInternalError,
  looksLikeInternalErrorDump,
} from "./user-facing-error";

describe("humanizeInternalError", () => {
  it("replaces serverless paths and CLI dumps", () => {
    const raw =
      "Missing week-2 partner export at /var/task/web/data/samples/real-partner-export.week2.local.csv. Copy template, then npm run eval:partner-export -- --week2.";
    expect(looksLikeInternalErrorDump(raw)).toBe(true);
    expect(humanizeInternalError(raw, "Week-2 export isn’t ready yet.")).toBe(
      "Week-2 export isn’t ready yet.",
    );
  });

  it("keeps short human sentences", () => {
    expect(
      humanizeInternalError("Partner Demo failed to load", "fallback"),
    ).toBe("Partner Demo failed to load");
  });
});
