/**
 * Product UI must not dump operator/CLI errors (absolute paths, npm, stacks).
 */

const INTERNAL_LEAK =
  /\/var\/task|\/workspace\/|node_modules|npm run |tsx |ENOENT|\.ts:\d+|eval:partner-export|real-partner-export\.(week2\.)?local\.csv/i;

export function looksLikeInternalErrorDump(message: string): boolean {
  return (
    INTERNAL_LEAK.test(message) ||
    (message.includes("Copy ") && message.includes("re-run"))
  );
}

/** Safe sentence for loaders / empty states. Never returns paths or CLI. */
export function humanizeInternalError(
  raw: string | null | undefined,
  fallback: string,
): string {
  const text = raw?.trim() ?? "";
  if (!text) return fallback;
  if (text === "Failed to fetch" || /failed to fetch|networkerror/i.test(text)) {
    return fallback;
  }
  if (looksLikeInternalErrorDump(text) || text.length > 180) {
    return fallback;
  }
  return text;
}
