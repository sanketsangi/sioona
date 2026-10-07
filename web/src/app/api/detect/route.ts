import { syncDetectionRun } from "@/lib/sync-detection-run";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { runWithTenant } from "@/lib/tenant-context";
import { runHybridDetectionWithLedger } from "@/lib/ai/run-with-ledger";
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
  return runWithTenant(session.tenantId, async () => {
    const store = await readStore();
    const { signals: detected, llm } = await runHybridDetectionWithLedger(
      store.conversations,
      store.messages,
      store.tenant.id,
      store.taxonomyOverrides,
      { resumeIds: [...new Set([...(store.llmFailedConversationIds ?? []), ...(store.llmSkippedConversationIds ?? [])])] }
    );
    const updated = store.tenant.id === "tenant_demo"
      ? await replaceSignalsPreservingFeedback(detected)
      : { ...store, signals: detected };
    if (llm.enabled) {
      updated.llmSkippedConversationIds = llm.skippedIds ?? [];
      updated.llmFailedConversationIds = llm.failedIds ?? [];
    }
    let result;
    try {
      if (store.tenant.id !== "tenant_demo") {
        if (llm.failed > 0) {
          await writeStore({ ...store, llmFailedConversationIds: llm.failedIds ?? [], llmSkippedConversationIds: llm.skippedIds ?? [] });
          return NextResponse.json({ error: "Classification failed. Previous published results remain active." }, { status: 503 });
        }
        result = await syncDetectionRun({ tenantId: store.tenant.id, conversations: store.conversations,
          messages: store.messages, signals: detected, contexts: llm.contexts, skippedIds: llm.skippedIds, priorSignals: store.signals });
      } else result = await syncPredictionsToBackend(updated.signals, store.tenant.id);
    } catch {
      return NextResponse.json({ error: "Detection publication failed. Please retry." }, { status: 503 });
    }
    const { signals, sync } = result;
    updated.signals = signals;
    await writeStore(updated);
    return NextResponse.json({
      count: updated.signals.length,
      signals: sortSignals(updated.signals),
      predictionSync: sync,
      detectLlm: llm,
    });
  });
}
