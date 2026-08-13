import { NextResponse } from "next/server";
import { runHybridDetection } from "@/lib/detect-llm";
import { sortSignals } from "@/lib/eval";
import {
  readStore,
  replaceSignalsPreservingFeedback,
  writeStore,
} from "@/lib/store";
import { syncPredictionsToBackend } from "@/lib/sync-predictions";

export async function POST() {
  const store = await readStore();
  const { signals: detected, llm } = await runHybridDetection(
    store.conversations,
    store.messages,
    store.tenant.id,
    store.taxonomyOverrides
  );
  const updated = await replaceSignalsPreservingFeedback(detected);
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
