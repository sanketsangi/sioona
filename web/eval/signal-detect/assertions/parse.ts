export type DetectJson = {
  signal?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  next_action?: unknown;
  reason?: unknown;
};

export function parseDetectOutput(output: unknown): DetectJson | null {
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as DetectJson;
    } catch {
      return null;
    }
  }
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  return output as DetectJson;
}
