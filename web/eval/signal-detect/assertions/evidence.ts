import { parseDetectOutput } from "./parse";

type Grade = { pass: boolean; score: number; reason: string };

/** Evidence may be empty only when the model chose signal "none". */
export default function evidenceWhenSignaled(output: unknown): Grade {
  const parsed = parseDetectOutput(output);
  if (!parsed) {
    return { pass: false, score: 0, reason: "Output is not a JSON object" };
  }
  if (parsed.signal === "none") {
    return {
      pass: true,
      score: 1,
      reason: "signal is none; empty evidence is allowed",
    };
  }
  const evidence =
    typeof parsed.evidence === "string" ? parsed.evidence.trim() : "";
  if (!evidence) {
    return {
      pass: false,
      score: 0,
      reason: "evidence must be non-empty when signal is not none",
    };
  }
  return { pass: true, score: 1, reason: "evidence is present" };
}
