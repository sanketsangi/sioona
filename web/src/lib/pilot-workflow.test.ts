import { expect, it } from "vitest";
import {
  pilotWorkflow,
  reportScopeHref,
  simulationLabel,
  snapshotQuotes,
} from "./pilot-workflow";
it("preserves upload and both date bounds without carrying names or tenant claims", () => {
  const href = reportScopeHref(
    "insights",
    new URLSearchParams(
      "uploadId=u1&file=week.csv&scoreFrom=2026-10-01&scoreTo=2026-10-04&reveal=1&tenant=evil",
    ),
    { preview: "s1" },
  );
  const p = new URL(href, "http://local").searchParams;
  expect(p.get("uploadId")).toBe("u1");
  expect(p.get("scoreTo")).toBe("2026-10-04");
  expect(p.has("reveal")).toBe(false);
  expect(p.has("tenant")).toBe(false);
});
it("does not complete steps from unknown or estimated totals", () => {
  expect(
    pilotWorkflow({
      conversations: 2,
      reviewed: null,
      outcomes: 0,
      pdf: false,
    }).map((x) => x.complete),
  ).toEqual([true, false, false, false]);
  expect(
    pilotWorkflow({
      conversations: 2,
      reviewed: 1,
      outcomes: 1,
      pdf: true,
    }).every((x) => x.complete),
  ).toBe(true);
});
it("labels only known synthetic fixtures as simulated", () => {
  expect(simulationLabel(["rehearsal_week_1.csv"])).toContain("Simulated");
  expect(simulationLabel(["client.csv"])).toContain("unverified");
  expect(simulationLabel(["testing.json", "client.csv"])).toContain("Mixed");
});

it("reconstructs snapshot quotes using code points and refuses mismatched source", () => {
  const signal = {
    conversationId: "c1",
    evidenceStatus: "valid",
    evidenceSpans: [{ messageId: "m1", start: 1, end: 6, quote: "close" }],
  } as import("./types").Signal;
  const messages = [
    { id: "m1", conversationId: "c1", content: "😀close account" },
  ] as import("./types").Message[];
  expect(snapshotQuotes(signal, messages)).toEqual(["close"]);
  expect(
    snapshotQuotes(signal, [{ ...messages[0], content: "different text" }]),
  ).toEqual([]);
});
