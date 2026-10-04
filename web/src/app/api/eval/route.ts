import { queryRevenueReport } from "@/lib/revenue-report-query";
import { runWithTenant } from "@/lib/tenant-context";
import { NextResponse } from "next/server";
import {
  applyBackendSignalScore,
  applyBackendSignalScoreToPilot,
  computeEvalMetrics,
} from "@/lib/eval";
import { requireApiSession } from "@/lib/auth-guard";
import { readStore } from "@/lib/store";

export async function GET(request: Request) {
  const session = await requireApiSession(request, "read");
  if (session instanceof NextResponse) return session;
  return runWithTenant(session.tenantId, async () => {
    const url = new URL(request.url);
    const { score, scopedStore, rangeError, scopeError } = await queryRevenueReport(await readStore(), {
      uploadId: url.searchParams.get("uploadId"),
      file: url.searchParams.get("file"),
      scoreFrom: url.searchParams.get("scoreFrom"),
      scoreTo: url.searchParams.get("scoreTo"),
    });
    if (scopeError) return NextResponse.json({ error: scopeError }, { status: 503 });
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 422 });
    return NextResponse.json({
      metrics: applyBackendSignalScore(computeEvalMetrics(scopedStore), score),
      pilot: applyBackendSignalScoreToPilot(scopedStore, score),
      signalScoreSource: score ? "backend" : "json_legacy",
    });
  });
}
