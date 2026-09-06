import type { EvalMetrics } from "@/lib/eval";
import type { LlmPassStats } from "@/lib/detect-llm";
import type { PartnerExportSource } from "@/lib/partner-export-eval";
import type { ConfusionExample } from "@/lib/testing-json-eval";

export type PartnerExportEvalApiOk = {
  ok: true;
  source: PartnerExportSource;
  filename: string;
  heuristic: EvalMetrics;
  adapted: EvalMetrics | null;
  hybrid: EvalMetrics | null;
  llm: LlmPassStats;
  confusion: ConfusionExample[];
  adaptedConfusion: ConfusionExample[] | null;
  /** Measurement banner — week2 IDs are w2_rd_* Reddit pack, not SignalScore. */
  note: string;
};

export type PartnerExportEvalApiErr = {
  ok: false;
  code: "missing_file" | "error";
  /** Product-safe copy — never filesystem paths or CLI. */
  message: string;
  /** Dev/internal only — omitted from production API responses. */
  debugMessage?: string;
};

export type PartnerExportEvalApiResponse =
  | PartnerExportEvalApiOk
  | PartnerExportEvalApiErr;
