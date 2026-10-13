import { describe, expect, it } from "vitest";
import { varyWithAccept } from "./vary-accept";

describe("varyWithAccept", () => {
  it("adds Accept without dropping Next's router vary list", () => {
    expect(varyWithAccept(undefined)).toBe("Accept");
    expect(varyWithAccept("Accept")).toBe("Accept");
    expect(
      varyWithAccept([
        "Accept",
        "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch",
      ]),
    ).toBe("Accept, rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch");
  });
});
