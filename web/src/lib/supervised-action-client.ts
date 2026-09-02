import type { Signal, SupervisedAction, SupervisedActionDecision } from "./types";

export class SupervisedActionError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SupervisedActionError";
  }
}

export async function postSupervisedAction(
  signal: Signal,
  body: {
    decision?: SupervisedActionDecision;
    subject?: string;
    draftBody?: string;
  } = {},
): Promise<SupervisedAction> {
  const res = await fetch(`/api/signals/${signal.id}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(body.decision ? { decision: body.decision } : {}),
      ...(body.subject != null ? { subject: body.subject } : {}),
      ...(body.draftBody != null ? { body: body.draftBody } : {}),
      ...(signal.backendSignalId
        ? { backendSignalId: signal.backendSignalId }
        : {}),
      conversationId: signal.conversationId,
      type: signal.type,
      confidence: signal.confidence,
      summary: signal.summary,
      evidence: signal.evidence,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    action?: SupervisedAction;
    error?: string;
  };

  if (!res.ok || !data.action) {
    throw new SupervisedActionError(
      data.error || "Failed to save the retention email draft",
      res.status,
    );
  }

  return data.action;
}
