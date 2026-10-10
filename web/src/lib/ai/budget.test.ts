import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/backend-client", () => ({ reserveInferenceAttempt: vi.fn(), settleInferenceReservation: vi.fn() }));
import { reserveInferenceAttempt, settleInferenceReservation } from "@/lib/backend-client";
import { createAttemptGuard } from "./budget";
const meta = { attemptId: "a", model: "qwen", inputBytes: 10, logicalOperationId: "op", attemptOrdinal: 1, conversationId: "c", routeVersion: "r", promptVersion: "p" };
beforeEach(() => vi.clearAllMocks());
it("fails closed when admission is unavailable", async () => {
  vi.mocked(reserveInferenceAttempt).mockRejectedValue(new Error("down"));
  await expect(createAttemptGuard("t").authorize(meta)).rejects.toMatchObject({ kind: "budget" });
});
it("counts retry/fallback fetches and keeps ambiguous allowance", async () => {
  vi.mocked(reserveInferenceAttempt).mockResolvedValue({ authorized: true, attempt_id: "a", mode: "attempts" });
  const guard = createAttemptGuard("t", 1);
  await guard.authorize(meta);
  await expect(guard.authorize({ ...meta, attemptId: "b", model: "fallback" })).rejects.toMatchObject({ kind: "budget" });
  expect(reserveInferenceAttempt).toHaveBeenCalledTimes(1);
  expect(settleInferenceReservation).not.toHaveBeenCalled();
});
it("reserves the local cap before awaiting concurrent admissions", async () => {
  let release!: (value: { authorized: boolean; attempt_id: string; mode: "attempts" }) => void;
  vi.mocked(reserveInferenceAttempt).mockReturnValue(new Promise(resolve => { release = resolve; }));
  const guard = createAttemptGuard("t", 1);
  const first = guard.authorize(meta);
  await expect(guard.authorize({ ...meta, attemptId: "b" })).rejects.toMatchObject({ kind: "budget" });
  release({ authorized: true, attempt_id: "a", mode: "attempts" });
  await first;
  expect(reserveInferenceAttempt).toHaveBeenCalledTimes(1);
});
it("makes zero provider fetches when admission fails", async () => {
  const { classifyConversationWithGroq, createGroqModelSession } = await import("../detect-llm");
  vi.stubEnv("GROQ_API_KEY", "synthetic-not-a-provider-key");
  vi.stubEnv("DETECT_LLM_MIN_INTERVAL_MS", "0");
  vi.mocked(reserveInferenceAttempt).mockRejectedValue(new Error("outage"));
  const providerFetch = vi.fn();
  try {
    await expect(classifyConversationWithGroq({ conversation: { id:"c",tenantId:"t",channel:"upload",customerName:"Customer",startedAt:"2026-10-10T00:00:00Z",messageIds:["m"] }, customerMessages:[{id:"m",conversationId:"c",role:"customer",content:"I want to open an account",timestamp:"2026-10-10T00:00:00Z"}] },createGroqModelSession(),{tenantId:"t",attemptGuard:createAttemptGuard("t"),providerFetch})).rejects.toMatchObject({kind:"budget"});
    expect(providerFetch).not.toHaveBeenCalled();
    expect(reserveInferenceAttempt).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllEnvs(); }
});
