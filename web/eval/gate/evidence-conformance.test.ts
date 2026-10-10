import { expect, it } from "vitest";
import { resolveEvidenceAnchor, validateEvidenceAnchor } from "./run-gate";
it("matches code-point spans after a supplementary character", () => {
  const messages = [{ id: "m", conversationId: "c", role: "customer" as const, content: "😀 I want to close my account", timestamp: "2026-01-01" }];
  const anchor = resolveEvidenceAnchor("I want to close my account", messages, "t", "c");
  expect(anchor).toMatchObject({ start: 2, end: 28 });
  expect(validateEvidenceAnchor({ ...anchor!, start: 0, end: 1 }, messages, "t", "c", "I want to close my account")).toBe(false);
});
import { readFileSync } from "node:fs";
const cases = JSON.parse(readFileSync(new URL("../../../tests/fixtures/evidence-conformance.json", import.meta.url), "utf8")) as {content:string;quote:string;start?:number;end?:number;match?:boolean}[];
for (const row of cases) it(`reconstructs shared case at ${row.start}:${row.end}`, () => {
  const messages = [{ id: "m", conversationId: "c", role: "customer" as const, content: row.content, timestamp: "2026-01-01" }];
  const anchor = resolveEvidenceAnchor(row.quote, messages, "t", "c");
  if (row.match === false) { expect(anchor).toBeNull(); return; }
  expect(anchor).toMatchObject({ start: row.start, end: row.end });
  expect(validateEvidenceAnchor(anchor!, messages, "t", "c", row.quote)).toBe(true);
});
