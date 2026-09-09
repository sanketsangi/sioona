import type { Signal } from "./types";

export class SignalActedError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SignalActedError";
  }
}

/** POST Mark Acted / undo — same payload as Insights header + rail. */
export async function postSignalActed(
  signal: Signal,
  acted: boolean,
): Promise<void> {
  const res = await fetch(`/api/signals/${signal.id}/acted`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      acted,
      // Hosted /tmp drift: API resolves by Neon UUID or conversation+type
      // when the JSON signal id from this card is missing on the instance.
      ...(signal.backendSignalId
        ? { backendSignalId: signal.backendSignalId }
        : {}),
      conversationId: signal.conversationId,
      type: signal.type,
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
    throw new SignalActedError(
      error || "Failed to update acted status",
      res.status,
    );
  }
}
