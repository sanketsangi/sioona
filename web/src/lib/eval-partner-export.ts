/**
 * CLI: heuristic + optional hybrid Detect v2 on partner export CSV.
 * Prefers gitignored real-partner-export.local.csv, else the committed template.
 * Live Groq only when DETECT_LLM=1 and GROQ_API_KEY are already set (no dotenv).
 *
 *   cd web && npm run eval:partner-export
 */

import { formatPartnerExportEval, loadPartnerExportEval } from "./partner-export-eval";

async function main() {
  const result = await loadPartnerExportEval();
  console.log(formatPartnerExportEval(result));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
