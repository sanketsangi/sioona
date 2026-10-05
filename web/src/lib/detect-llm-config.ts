/** Client-safe display limits; imports no classifier, identity or Node APIs. */
export const DETECT_LLM_MAX_CALLS = 8;
export function detectLlmMaxCalls(): number {
  const value = Number(process.env.DETECT_LLM_MAX_CALLS);
  return Number.isFinite(value) && value > 0 ? value : DETECT_LLM_MAX_CALLS;
}
