import { expect, it, vi } from "vitest";
vi.mock("./ledger", () => ({ createRunLedger: () => ({ preflight: async () => false }) }));
vi.mock("@/lib/detect-llm", () => ({ runHybridDetection: vi.fn(async () => ({ signals: [], llm: {} })) }));
import { runHybridDetection } from "@/lib/detect-llm";
import { runHybridDetectionWithLedger } from "./run-with-ledger";
it("demo makes no unmetered provider calls when ledger is unavailable", async () => {
  await runHybridDetectionWithLedger([], [], "tenant_demo");
  expect(runHybridDetection).toHaveBeenCalledWith([], [], "tenant_demo", undefined, { skipLlmReason: "ledger" });
});
