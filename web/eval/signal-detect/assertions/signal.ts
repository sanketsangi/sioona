import { parseDetectOutput } from "./parse";

type Grade = { pass: boolean; score: number; reason: string };

/**
 * Labeled signal accuracy. `expected_signal` is a test var and is not
 * part of the model request.
 */
export default function expectedSignal(
  output: unknown,
  context: { vars?: Record<string, unknown> }
): Grade {
  const expected = context.vars?.expected_signal;
  const parsed = parseDetectOutput(output);
  if (!parsed) {
    return { pass: false, score: 0, reason: "Output is not a JSON object" };
  }
  if (parsed.signal === expected) {
    return { pass: true, score: 1, reason: `signal is ${String(expected)}` };
  }
  return {
    pass: false,
    score: 0,
    reason: `expected signal ${String(expected)}, got ${String(parsed.signal)}`,
  };
}
