import { describe, expect, it } from "vitest";
import {
  UPLOAD_TIPS,
  UPLOAD_TIP_INTERVAL_MS,
  nextUploadTipIndex,
} from "./upload-tips";

describe("upload-tips", () => {
  it("ships several product + ETA tips", () => {
    expect(UPLOAD_TIPS.length).toBeGreaterThanOrEqual(4);
    expect(UPLOAD_TIP_INTERVAL_MS).toBeGreaterThanOrEqual(3000);
    for (const tip of UPLOAD_TIPS) {
      expect(tip.trim().length).toBeGreaterThan(20);
      expect(tip.endsWith(".")).toBe(true);
    }
  });

  it("cycles tip index", () => {
    expect(nextUploadTipIndex(0, 3)).toBe(1);
    expect(nextUploadTipIndex(2, 3)).toBe(0);
    expect(nextUploadTipIndex(0, 0)).toBe(0);
  });
});
