/**
 * CLI: heuristic + optional hybrid Detect v2 on partner export CSV / JSON.
 * Prefers gitignored real-partner-export.local.csv under data/samples/,
 * else the committed template in src/data/fixtures/.
 * Week-2 held-out: --week2 or PARTNER_EXPORT=week2 → real-partner-export.week2.local.csv
 * (no week-1 fallback).
 * Week-4 Zerodha Batch-02 held-out: --week4-batch02 or PARTNER_EXPORT=week4-batch02
 * → Synthetic-Data JSON in place (no copy into data/samples/, no ingest / Neon write).
 * Live Groq only when DETECT_LLM=1 and GROQ_API_KEY are already set (no dotenv).
 *
 *   cd web && npm run eval:partner-export
 *   cd web && npm run eval:partner-export -- --week2
 *   cd web && npm run eval:partner-export -- --week4-batch02
 *   PARTNER_EXPORT=week2 npm run eval:partner-export
 */

import {
  formatPartnerExportEval,
  isWeek4Batch02EvalRequested,
  loadPartnerExportEval,
} from "./partner-export-eval";

async function main() {
  const preferWeek4Batch02 = isWeek4Batch02EvalRequested();
  const preferWeek2 =
    !preferWeek4Batch02 &&
    (process.argv.includes("--week2") || process.env.PARTNER_EXPORT === "week2");
  const result = await loadPartnerExportEval({
    preferWeek2,
    preferWeek4Batch02,
  });
  console.log(formatPartnerExportEval(result));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
