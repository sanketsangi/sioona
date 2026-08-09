import { NextResponse } from "next/server";
import {
  applyBackendSignalScore,
  applyBackendSignalScoreToPilot,
  computeEvalMetrics,
} from "@/lib/eval";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import { readStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  const backendScore = await fetchSignalScoreSafe(store.tenant.id);
  const metrics = applyBackendSignalScore(
    computeEvalMetrics(store),
    backendScore
  );
  const pilot = applyBackendSignalScoreToPilot(store, backendScore);
  return NextResponse.json({
    metrics,
    pilot,
    signalScoreSource: backendScore ? "backend" : "json_legacy",
  });
}
