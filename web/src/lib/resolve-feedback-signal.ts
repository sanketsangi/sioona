import type { Signal, SignalType } from "./types";

const KNOWN_TYPES = new Set<SignalType>(["lead", "retention", "upsell"]);

export function asSignalType(raw: unknown): SignalType | null {
  if (typeof raw !== "string") return null;
  return KNOWN_TYPES.has(raw as SignalType) ? (raw as SignalType) : null;
}

export type SignalLocator = {
  /** Neon prediction UUID when JSON id drifted across Vercel instances. */
  backendSignalId?: string;
  conversationId?: string;
  type?: unknown;
};

/**
 * Resolve JSON signal when URL id is stale (hydrate / ephemeral /tmp drift).
 * Prefer exact id, then Neon UUID, then conversation+type from the client body.
 */
export function resolveFeedbackSignal(
  signals: Signal[],
  id: string,
  body: SignalLocator,
): Signal | undefined {
  const byId = signals.find((s) => s.id === id);
  if (byId) return byId;

  const backendId = body.backendSignalId?.trim();
  if (backendId) {
    const byBackend = signals.find((s) => s.backendSignalId === backendId);
    if (byBackend) return byBackend;
  }

  const conversationId = body.conversationId?.trim();
  const type = asSignalType(body.type);
  if (conversationId && type) {
    return signals.find(
      (s) => s.conversationId === conversationId && s.type === type,
    );
  }

  return undefined;
}
