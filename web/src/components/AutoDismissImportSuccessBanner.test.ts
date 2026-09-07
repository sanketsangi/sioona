import { describe, expect, it, vi } from "vitest";
import {
  IMPORT_SUCCESS_BANNER_FADE_MS,
  IMPORT_SUCCESS_BANNER_HOLD_MS,
  stripImportSuccessParams,
} from "./AutoDismissImportSuccessBanner";

describe("stripImportSuccessParams", () => {
  it("removes imported and signals while preserving other query keys", () => {
    const replace = vi.fn();
    const stripped = stripImportSuccessParams(
      "?view=insights&imported=3&signals=2&status=new&demo=1",
      replace,
    );
    expect(stripped).toBe(true);
    expect(replace).toHaveBeenCalledWith(
      "/?view=insights&status=new&demo=1",
    );
  });

  it("no-ops when imported/signals are already absent", () => {
    const replace = vi.fn();
    expect(stripImportSuccessParams("?view=insights&status=new", replace)).toBe(
      false,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("lands on / when only imported/signals remain", () => {
    const replace = vi.fn();
    stripImportSuccessParams("imported=1&signals=0", replace);
    expect(replace).toHaveBeenCalledWith("/");
  });
});

describe("import success banner timing", () => {
  it("holds ~4s then fades ~280ms", () => {
    expect(IMPORT_SUCCESS_BANNER_HOLD_MS).toBe(4000);
    expect(IMPORT_SUCCESS_BANNER_FADE_MS).toBe(280);
  });
});
