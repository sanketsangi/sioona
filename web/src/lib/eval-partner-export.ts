/**
 * CLI: heuristic + optional hybrid Detect v2 on partner export CSV.
 * Prefers gitignored real-partner-export.local.csv, else the committed template.
 * Week-2 held-out: --week2 or PARTNER_EXPORT=week2 → real-partner-export.week2.local.csv
 * (no week-1 fallback). Live Groq only when DETECT_LLM=1 and GROQ_API_KEY are already set
 * (no dotenv).
 *
 *   cd web && npm run eval:partner-export
 *   cd web && npm run eval:partner-export -- --week2
 *   PARTNER_EXPORT=week2 npm run eval:partner-export
 */

import { formatPartnerExportEval, loadPartnerExportEval } from "./partner-export-eval";

async function main() {
  const preferWeek2 =
    process.argv.includes("--week2") ||
    process.env.PARTNER_EXPORT === "week2";
  const result = await loadPartnerExportEval({ preferWeek2 });
  console.log(formatPartnerExportEval(result));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
