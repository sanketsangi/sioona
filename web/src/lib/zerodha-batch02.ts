import { existsSync } from "fs";
import path from "path";

/** Deployable Partner Demo seed (Vercel `web/` cwd). */
export const ZERODHA_BATCH02_FILENAME = "zerodha_batch_02.json";

export const EXPECTED_ZERODHA_BATCH02 = {
  conversations: 100,
} as const;

/**
 * Resolve `zerodha_batch_02.json` for Node/Vitest and Next (cwd usually `web/`).
 * Prefer `web/data/samples/` so Production cannot depend on repo-root.
 */
export function resolveZerodhaBatch02Path(repoRoot?: string): string {
  const cwd = process.cwd();
  const samplesCopy = path.join(
    cwd,
    "data",
    "samples",
    ZERODHA_BATCH02_FILENAME
  );
  if (existsSync(samplesCopy)) return samplesCopy;

  if (repoRoot) {
    return path.join(repoRoot, "web", "data", "samples", ZERODHA_BATCH02_FILENAME);
  }

  const fromRepoCwd = path.join(
    cwd,
    "web",
    "data",
    "samples",
    ZERODHA_BATCH02_FILENAME
  );
  if (existsSync(fromRepoCwd)) return fromRepoCwd;

  return samplesCopy;
}
