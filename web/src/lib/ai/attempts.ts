import type { AttemptSink } from "./types";

/** Default when no ledger is attached (tests / offline eval). */
export const noopAttemptSink: AttemptSink = () => {};

/** UUID for a logical classification or a single provider fetch. */
export function createInferenceId(): string {
  return crypto.randomUUID();
}
