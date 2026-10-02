import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("joins truthy classes and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, "b", { c: true, d: false })).toBe(
      "a b c",
    );
  });

  it("lets later Tailwind utilities win", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("keeps typography roles when a text color is also present", () => {
    expect(cn("text-label-14", "text-sio-gray-900")).toBe(
      "text-label-14 text-sio-gray-900",
    );
  });

  it("replaces one typography role with another", () => {
    expect(cn("text-copy-14", "text-heading-20")).toBe("text-heading-20");
  });
});
