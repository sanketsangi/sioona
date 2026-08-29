import { NextResponse } from "next/server";
import {
  applyBackendSignalScore,
  applyBackendSignalScoreToPilot,
  computeEvalMetrics,
} from "@/lib/eval";
import { fetchNeedsReview } from "@/lib/fetch-needs-review";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import { fetchTenantSignals } from "@/lib/fetch-tenant-signals";
import { fetchOverlayConversations } from "@/lib/hydrate-conversations";
import {
  keepSetConversationIds,
  missingConversationIds,
  pendingQueueSignals,
  reviewedQueueSignals,
  reviewedSignalsFromStore,
} from "@/lib/join-needs-review";
import { resolveSignalScoreDateFrom } from "@/lib/signal-score-window";
import { readStore } from "@/lib/store";

export async function GET(request: Request) {
  const store = await readStore();
  const url = new URL(request.url);
  const [needsReview, tenantSignals] = await Promise.all([
    fetchNeedsReview(store.tenant.id),
    fetchTenantSignals(store.tenant.id),
  ]);
  const pendingRaw = needsReview.ok
    ? pendingQueueSignals(needsReview.predictions, store.signals)
    : store.signals.filter((s) => !s.feedback);
  const reviewed = tenantSignals.ok
    ? reviewedQueueSignals(tenantSignals.rows, store.signals)
    : reviewedSignalsFromStore(store.signals);
  const overlayChats = await fetchOverlayConversations(
    store.tenant.id,
    missingConversationIds([...pendingRaw, ...reviewed], store.conversations)
  );
  const keepSetIds = keepSetConversationIds(
    store.conversations,
    overlayChats?.conversations
  );
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
