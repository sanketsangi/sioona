import { NextResponse } from "next/server";
import { runDetection } from "@/lib/detect";
import { sortSignals } from "@/lib/eval";
import { readStore, replaceSignalsPreservingFeedback } from "@/lib/store";

export async function POST() {
  const store = await readStore();
  const detected = runDetection(
    store.conversations,
    store.messages,
    store.tenant.id,
    store.taxonomyOverrides
  );
  const updated = await replaceSignalsPreservingFeedback(detected);
  return NextResponse.json({
    count: updated.signals.length,
    signals: sortSignals(updated.signals),
  });
}
