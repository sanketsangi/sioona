/**
 * Offline smoke provider for Promptfoo — returns schema-valid JSON using expected labels.
 * Use for assertion pipeline checks when Groq is unreachable (CI / sandbox).
 */
export default class SmokeProvider {
  id() {
    return "sioona-smoke";
  }

  async callApi(_prompt, context) {
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
