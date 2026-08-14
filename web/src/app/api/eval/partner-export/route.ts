import { NextResponse } from "next/server";
import type { PartnerExportEvalApiErr } from "@/lib/partner-export-eval-api";
import {
  loadPartnerExportEval,
  type PartnerExportEvalResult,
} from "@/lib/partner-export-eval";
import type { PartnerExportEvalApiOk } from "@/lib/partner-export-eval-api";

export const dynamic = "force-dynamic";

const CONFUSION_LIMIT = 12;

function toPayload(result: PartnerExportEvalResult): PartnerExportEvalApiOk {
  const week2 = result.source === "week2";
  return {
    ok: true,
    source: result.source,
    filename: result.filename,
    heuristic: result.heuristic,
    adapted: result.adapted,
    hybrid: result.hybrid,
    llm: result.llm,
    confusion: result.confusion.slice(0, CONFUSION_LIMIT),
    adaptedConfusion: result.adaptedConfusion
      ? result.adaptedConfusion.slice(0, CONFUSION_LIMIT)
      : null,
    note: week2
      ? "source=week2 · IDs are w2_rd_* (Reddit finance measurement pack) — not real partner held-out proof. CLI dry-run only: no Neon dual-write, not SignalScore / go-no-go. Never commit *.local.csv."
      : "Partner-export Detect measurement — not SignalScore / go-no-go. No Neon dual-write. Never commit *.local.csv.",
  };
}

/**
 * GET /api/eval/partner-export?week2=1
 * Offline labeled Detect P/R (base vs Adapt). Does not touch Neon or the JSON store.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const preferWeek2 =
    url.searchParams.get("week2") === "1" ||
    url.searchParams.get("week2") === "true" ||
    url.searchParams.get("source") === "week2";

  try {
    const result = await loadPartnerExportEval({
      preferWeek2,
      skipHybrid: true,
    });
    return NextResponse.json(toPayload(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Eval failed";
    const missing =
      /missing week-2|missing.*week2|enoent|no such file/i.test(message) ||
      message.toLowerCase().includes("week2.local.csv");
    return NextResponse.json(
      {
        ok: false,
        code: missing ? "missing_file" : "error",
        message,
      } satisfies PartnerExportEvalApiErr,
      { status: missing ? 404 : 500 }
    );
  }
}
