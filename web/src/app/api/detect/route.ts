import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { enterStoreTenant } from "@/lib/tenant-context";
import { runHybridDetection } from "@/lib/detect-llm";
import { sortSignals } from "@/lib/eval";
import {
  readStore,
  replaceSignalsPreservingFeedback,
  writeStore,
} from "@/lib/store";
import { syncPredictionsToBackend } from "@/lib/sync-predictions";

export async function POST(request: Request) {
  const session = await requireApiSession(request, "mutate");
  if (session instanceof NextResponse) return session;
  enterStoreTenant(session.tenantId);
  const store = await readStore();
  const { signals: detected, llm } = await runHybridDetection(
    store.conversations,
    store.messages,
    store.tenant.id,
    store.taxonomyOverrides,
    { resumeIds: store.llmSkippedConversationIds }
  );
  const updated = await replaceSignalsPreservingFeedback(detected);
  if (llm.enabled) {
    updated.llmSkippedConversationIds = llm.skippedIds ?? [];
  }
  const { signals, sync } = await syncPredictionsToBackend(
    updated.signals,
    store.tenant.id
  );
  updated.signals = signals;
  await writeStore(updated);
  return NextResponse.json({
    count: updated.signals.length,
    signals: sortSignals(updated.signals),
    predictionSync: sync,
    detectLlm: llm,
  });
}
