import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { varyWithAccept } from "./vary-accept";
import "@/instrumentation-node";

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

  it("keeps Accept when Next appends its router vary list", () => {
    const response = new ServerResponse(new IncomingMessage(new Socket()));
    response.appendHeader("vary", "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch");
    expect(response.getHeader("vary")).toBe(
      "Accept, rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch",
    );
  });
});
