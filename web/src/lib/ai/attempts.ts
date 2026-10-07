import type { AttemptSink } from "./types";

/** Production default until CB-06 persists attempts. */
export const noopAttemptSink: AttemptSink = () => {};

/** UUID for a logical classification or a single provider fetch. */
export function createInferenceId(): string {
  return crypto.randomUUID();
}
