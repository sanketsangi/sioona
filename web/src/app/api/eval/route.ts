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
  shouldOverlayKeepSetChats,
  signalScoreConversationIds,
} from "@/lib/join-needs-review";
import { resolveSignalScoreDateFrom } from "@/lib/signal-score-window";
import { readStore } from "@/lib/store";
import { parseReplacedParam } from "@/lib/views";

export async function GET(request: Request) {
  const store = await readStore();
  const url = new URL(request.url);
  const jsonKeepSet = parseReplacedParam(url.searchParams.get("replaced"));
  const overlay = shouldOverlayKeepSetChats({
    jsonKeepSet,
    jsonConversationCount: store.conversations.length,
  });
  // Needs-review and tenant signals only fill overlay holes. When JSON
  // already holds the keep-set, SignalScore omits conversation ids and
  // those two unbounded list calls do not change the score.
  const overlayChats = overlay
    ? await (async () => {
        const [needsReview, tenantSignals] = await Promise.all([
          fetchNeedsReview(store.tenant.id),
          fetchTenantSignals(store.tenant.id),
        ]);
        const pendingRaw = needsReview.ok
          ? pendingQueueSignals(
              needsReview.predictions,
              store.signals,
              tenantSignals.ok ? tenantSignals.rows : undefined
            )
          : store.signals.filter((s) => !s.feedback);
        const reviewed = tenantSignals.ok
          ? reviewedQueueSignals(tenantSignals.rows, store.signals)
          : reviewedSignalsFromStore(store.signals);
        return fetchOverlayConversations(
          store.tenant.id,
          missingConversationIds(
            [...pendingRaw, ...reviewed],
            store.conversations
          )
        );
      })()
    : null;
  const keepSetIds = keepSetConversationIds(
    store.conversations,
    overlayChats?.conversations,
    store.signals.map((signal) => signal.conversationId)
  );
  const scoreDateFrom = resolveSignalScoreDateFrom({
    scoreFrom: url.searchParams.get("scoreFrom"),
    envFrom: process.env.SIGNAL_SCORE_FROM,
  });
  const backendScore = await fetchSignalScoreSafe(
    store.tenant.id,
    signalScoreConversationIds({
      keepSetIds,
      jsonKeepSet,
      jsonConversationCount: store.conversations.length,
    }),
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
