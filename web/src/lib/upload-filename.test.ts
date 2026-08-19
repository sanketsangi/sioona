import { describe, expect, it } from "vitest";
import { lastUploadedFileName } from "./upload-filename";

describe("lastUploadedFileName", () => {
  it("keeps a real basename with extension", () => {
    expect(lastUploadedFileName("groww_batch_02.csv")).toBe(
      "groww_batch_02.csv"
    );
  });

  it("strips directory prefixes", () => {
    expect(lastUploadedFileName("/tmp/exports/groww_batch_02.csv")).toBe(
      "groww_batch_02.csv"
    );
    expect(lastUploadedFileName("C:\\exports\\week1.csv")).toBe("week1.csv");
  });

  it("returns undefined for empty names", () => {
    expect(lastUploadedFileName("")).toBeUndefined();
    expect(lastUploadedFileName("   ")).toBeUndefined();
    expect(lastUploadedFileName(null)).toBeUndefined();
    expect(lastUploadedFileName(undefined)).toBeUndefined();
  });
});
