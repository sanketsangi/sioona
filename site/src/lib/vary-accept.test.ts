import { VARY } from "./http-headers";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { varyWithAccept } from "./vary-accept";
import "@/instrumentation-node";

describe("Vary preservation", () => {
  it("retains custom tokens and every production token without duplicates", () => {
    const tokens = varyWithAccept("Accept, X-Custom, accept").split(", ");
    expect(tokens).toContain("X-Custom");
    for (const token of VARY.split(", ")) expect(tokens).toContain(token);
    expect(tokens.filter(token => token.toLowerCase() === "accept")).toHaveLength(1);
    expect(varyWithAccept(undefined)).toBe(VARY);
  });
  it("keeps every token when Next appends its router vary list", () => {
    const response = new ServerResponse(new IncomingMessage(new Socket()));
    response.appendHeader("vary", "rsc, next-router-state-tree");
    for (const token of VARY.split(", ")) expect(String(response.getHeader("vary")).split(", ")).toContain(token);
  });
});
