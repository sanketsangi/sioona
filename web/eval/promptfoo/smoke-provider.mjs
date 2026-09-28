/**
 * Offline smoke provider for Promptfoo — returns schema-valid JSON using expected labels.
 * Use for assertion pipeline checks when Groq is unreachable (CI / sandbox).
 * Also checks the rendered prompt is system+user (not a bare user string).
 */
function asMessages(prompt) {
  if (Array.isArray(prompt)) return prompt;
  if (typeof prompt !== "string") return [];
  const trimmed = prompt.trim();
  if (!trimmed.startsWith("[")) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default class SmokeProvider {
  id() {
    return "sioona-smoke";
  }

  async callApi(prompt, context) {
    const messages = asMessages(prompt);
    const system = messages.find((message) => message?.role === "system");
    if (!system || !String(system.content ?? "").includes("retention_risk")) {
      return {
        error:
          "Detect v2 eval must send SYSTEM_PROMPT as a system role (not a string user prompt).",
      };
    }

    const signal = context?.vars?.expectedSignal ?? "none";
    const evidence =
      signal === "none"
        ? ""
        : "I want to open a demat account this week";
    return {
      output: JSON.stringify({
        signal,
        confidence: 0.88,
        evidence,
        next_action: signal === "none" ? "none" : "Route to sales",
        reason: "Smoke fixture for offline eval.",
      }),
    };
  }
}
