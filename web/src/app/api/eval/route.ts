import { NextResponse } from "next/server";
import {
  applyBackendSignalScore,
  applyBackendSignalScoreToPilot,
  computeEvalMetrics,
} from "@/lib/eval";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import { resolveSignalScoreDateFrom } from "@/lib/signal-score-window";
import { readStore } from "@/lib/store";

export async function GET(request: Request) {
  const store = await readStore();
  const url = new URL(request.url);
  const keepSetIds = store.conversations.map((c) => c.id);
  const scoreDateFrom = resolveSignalScoreDateFrom({
    scoreFrom: url.searchParams.get("scoreFrom"),
    envFrom: process.env.SIGNAL_SCORE_FROM,
  });
  const backendScore = await fetchSignalScoreSafe(
    store.tenant.id,
    keepSetIds,
    { dateFrom: scoreDateFrom }
  );
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
