/** No cache: every fetch obtains server-side admission immediately beforehand. */
import { reserveInferenceAttempt, settleInferenceReservation } from "@/lib/backend-client";
import { createInferenceId } from "./attempts";
import type { GateArtifact } from "../../../eval/gate/compare";
export type AttemptAdmission = { attemptId: string; model: string; inputBytes: number; logicalOperationId: string;
  attemptOrdinal: number; conversationId?: string; routeVersion: string; promptVersion: string };
export type AttemptGuard = {
  authorize: (attempt: AttemptAdmission) => Promise<void>;
  settle: (attemptId: string) => Promise<void>;
  metrics: () => GateArtifact["cost"];
};
export class InferencePaused extends Error {
  readonly kind = "budget";
  readonly retryable = false;
  constructor(readonly reason: string) { super("AI paused"); }
}
export function createAttemptGuard(tenantId: string, localCap?: number): AttemptGuard {
  const runId = createInferenceId();
  let attempts = 0;
  let admissions = 0;
  return {
    authorize: async meta => {
      if (localCap !== undefined && admissions >= localCap) throw new InferencePaused("attempt_cap");
      admissions += 1;
      try {
        const result = await reserveInferenceAttempt(tenantId, { attempt_id: meta.attemptId, run_id: runId,
          provider: "groq", model: meta.model, input_bytes: meta.inputBytes, logical_operation_id: meta.logicalOperationId,
          attempt_ordinal: meta.attemptOrdinal, conversation_id: meta.conversationId, route_version: meta.routeVersion, prompt_version: meta.promptVersion });
        if (result.authorized !== true || result.attempt_id !== meta.attemptId) throw new Error("denied");
      } catch { admissions -= 1; throw new InferencePaused("budget_unavailable_or_exhausted"); }
      attempts += 1;
    },
    settle: async attemptId => {
      try { await settleInferenceReservation(tenantId, attemptId); }
      catch { console.warn("inference_reservation_settle_failed", { count: 1 }); }
    },
    metrics: () => ({ attempts, unknown_cost_attempts: attempts, estimated_usd: null, unknown_cost_fraction: attempts ? 1 : null }),
  };
}
