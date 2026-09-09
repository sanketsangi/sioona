import type { FeedbackLabel, Signal } from "./types";

export class SignalFeedbackError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SignalFeedbackError";
  }
}

/** POST SignalScore feedback — same payload as Insights review controls. */
export async function postSignalFeedback(
  signal: Signal,
  label: FeedbackLabel,
  note?: string,
): Promise<void> {
  const res = await fetch(`/api/signals/${signal.id}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label,
      note: note?.trim() || undefined,
      ...(signal.backendSignalId
        ? { backendSignalId: signal.backendSignalId }
        : {}),
      conversationId: signal.conversationId,
      type: signal.type,
      confidence: signal.confidence,
      summary: signal.summary,
    }),
  });

  if (!res.ok) {
    let error: string | undefined;
    try {
      const data = (await res.json()) as { error?: string };
      error = data.error;
    } catch {
      // Non-JSON error bodies still surface a product-safe fallback.
    }
    if (res.status === 503) {
      throw new SignalFeedbackError(
        error || "Signal Score backend unavailable — feedback not saved",
        res.status,
      );
    }
    throw new SignalFeedbackError(
      error || "Failed to save feedback",
      res.status,
    );
  }
}
