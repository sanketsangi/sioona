/**
 * Promptfoo javascript asserts for Detect v2 JSON.
 * Named exports: file://asserts.js:assertIsAllowedSignal
 */
const ALLOWED = new Set([
  "retention_risk",
  "upsell_opportunity",
  "lead_intent",
  "none",
]);

function parseOutput(output) {
  if (output && typeof output === "object") {
    if (typeof output.output === "string") {
      return JSON.parse(output.output);
    }
    return output;
  }
  if (typeof output !== "string") {
    throw new Error("output is not JSON text");
  }
  const stripped = output.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? stripped).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const jsonText =
    start >= 0 && end > start ? body.slice(start, end + 1) : body;
  return JSON.parse(jsonText);
}

function assertIsAllowedSignal(output) {
  const obj = parseOutput(output);
  if (!ALLOWED.has(obj.signal)) {
    return {
      pass: false,
      score: 0,
      reason: `signal '${String(obj.signal)}' is not one of ${[...ALLOWED].join(", ")}`,
    };
  }
  return { pass: true, score: 1, reason: `signal ${obj.signal} is allowed` };
}

function assertEvidenceWhenNotNone(output) {
  const obj = parseOutput(output);
  if (obj.signal === "none") {
    return {
      pass: true,
      score: 1,
      reason: "signal=none; empty evidence is allowed",
    };
  }
  if (typeof obj.evidence !== "string" || !obj.evidence.trim()) {
    return {
      pass: false,
      score: 0,
      reason: "evidence must be a non-empty string when signal is not none",
    };
  }
  return { pass: true, score: 1, reason: "evidence is present" };
}

function assertConfidenceRange(output) {
  const obj = parseOutput(output);
  const confidence = Number(obj.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return {
      pass: false,
      score: 0,
      reason: `confidence ${String(obj.confidence)} is not a number in [0, 1]`,
    };
  }
  return {
    pass: true,
    score: 1,
    reason: `confidence ${confidence} is in [0, 1]`,
  };
}

function assertSignalAccuracy(output, context) {
  const obj = parseOutput(output);
  const expected = context?.vars?.expected_signal;
  if (!expected) {
    return { pass: false, reason: "vars.expected_signal is missing" };
  }
  if (obj.signal !== expected) {
    return {
      pass: false,
      score: 0,
      reason: `signal=${obj.signal}, expected=${expected}`,
    };
  }
  return {
    pass: true,
    score: 1,
    reason: `signal matches ${expected}`,
  };
}

module.exports = {
  parseOutput,
  ALLOWED,
  assertIsAllowedSignal,
  assertEvidenceWhenNotNone,
  assertConfidenceRange,
  assertSignalAccuracy,
};
