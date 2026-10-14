import { detectionExecution } from "@/lib/detection-execution";
import { enqueueCanonicalDetect } from "@/lib/enqueue-detection";
import { syncDetectionRun } from "@/lib/sync-detection-run";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { runWithTenant } from "@/lib/tenant-context";
import { runHybridDetectionWithLedger } from "@/lib/ai/run-with-ledger";
import { sortSignals } from "@/lib/eval";
import {
  persistCanonicalDetectionResume,
  readStore,
  replaceSignalsPreservingFeedback,
  writeStore,
} from "@/lib/store";
import { syncPredictionsToBackend } from "@/lib/sync-predictions";
import { getStateMode } from "@/lib/state-mode";

export async function POST(request: Request) {
  const session = await requireApiSession(request, "mutate");
  if (session instanceof NextResponse) return session;
  return runWithTenant(session.tenantId, async () => {
    const store = await readStore();
    if (detectionExecution() === "worker") {
      try {
        const job = await enqueueCanonicalDetect(session.tenantId, store.conversations);
        return NextResponse.json(job, { status: 202 });
      } catch {
        return NextResponse.json({ error: "Detection job could not be queued" }, { status: 503 });
      }
    }
    const useCanonicalPublication =
      store.tenant.id !== "tenant_demo" || getStateMode() === "postgres";
    const { signals: detected, llm } = await runHybridDetectionWithLedger(
      store.conversations,
      store.messages,
      store.tenant.id,
      store.taxonomyOverrides,
      { resumeIds: [...new Set([...(store.llmFailedConversationIds ?? []), ...(store.llmSkippedConversationIds ?? [])])] }
    );
    const updated = useCanonicalPublication
      ? { ...store, signals: detected }
      : await replaceSignalsPreservingFeedback(detected);
    if (llm.enabled) {
      updated.llmSkippedConversationIds = llm.skippedIds ?? [];
      updated.llmFailedConversationIds = llm.failedIds ?? [];
    }
    const saveResume = async (
      failedIds: readonly string[],
      skippedIds: readonly string[],
    ) => {
      await persistCanonicalDetectionResume(store.tenant.id, failedIds, skippedIds,
        store.detectionResumeUpdatedAt ?? "1970-01-01T00:00:00Z");
      await writeStore({
        ...store,
        llmFailedConversationIds: [...failedIds],
        llmSkippedConversationIds: [...skippedIds],
      });
    };
    if (useCanonicalPublication && llm.enabled && llm.failed > 0) {
      const skipped = new Set(llm.skippedIds ?? []);
      const unpublished = [
        ...new Set([
          ...(llm.failedIds ?? []),
          ...(store.llmFailedConversationIds ?? []).filter((id) => !skipped.has(id)),
          ...store.conversations
            .map((conversation) => conversation.id)
            .filter((id) => !skipped.has(id)),
        ]),
      ];
      try {
        await saveResume(unpublished, llm.skippedIds ?? []);
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Detection resume could not be saved. Please retry.";
        return NextResponse.json({ error: message }, { status: 503 });
      }
      return NextResponse.json({ error: "Classification failed. Previous published results remain active." }, { status: 503 });
    }
    let result;
    try {
      if (useCanonicalPublication) {
        result = await syncDetectionRun({ tenantId: store.tenant.id, conversations: store.conversations,
          messages: store.messages, signals: detected, contexts: llm.contexts, skippedIds: llm.skippedIds, priorSignals: store.signals });
      } else result = await syncPredictionsToBackend(updated.signals, store.tenant.id);
    } catch {
      if (useCanonicalPublication && llm.enabled) {
        const skipped = new Set(llm.skippedIds ?? []);
        const unpublished = [
          ...new Set([
            ...(store.llmFailedConversationIds ?? []).filter((id) => !skipped.has(id)),
            ...store.conversations
              .map((conversation) => conversation.id)
              .filter((id) => !skipped.has(id)),
          ]),
        ];
        try {
          await saveResume(unpublished, llm.skippedIds ?? []);
        } catch {
          // The previous cursor stays in place when this write fails.
        }
      }
      return NextResponse.json({ error: "Detection publication failed. Please retry." }, { status: 503 });
    }
    if (useCanonicalPublication && llm.enabled) {
      try {
        await persistCanonicalDetectionResume(
          store.tenant.id,
          llm.failedIds ?? [],
          llm.skippedIds ?? [],
          store.detectionResumeUpdatedAt ?? "1970-01-01T00:00:00Z",
        );
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Detection resume could not be saved. Please retry.";
        return NextResponse.json({ error: message }, { status: 503 });
      }
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
