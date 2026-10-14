import { detectionExecution } from "@/lib/detection-execution";
import { enqueueCanonicalDetect } from "@/lib/enqueue-detection";
import type { BackendJobStatus } from "@/lib/backend-client";
import { runWithTenant } from "@/lib/tenant-context";
import { after, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { isLivePartnerKeepSet } from "@/lib/vault-file";
import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "@/data/fixtures/partner-export-overrides";
import { ZERODHA_BATCH01_ADAPT_OVERRIDES } from "@/data/fixtures/zerodha-batch01-overrides";
import { persistDeferredIngestDualWrite } from "@/lib/defer-ingest-sync";
import { syncTaxonomyOverridesToBackend } from "@/lib/sync-taxonomy";
import { runHybridDetectionWithLedger } from "@/lib/ai/run-with-ledger";
import { sortSignals } from "@/lib/eval";
import {
  addTaxonomyOverride,
  mergeTaxonomyOverrides,
  readStore,
  replaceSignalsPreservingFeedback,
  setPilotBaseline,
  persistCanonicalDetectionResume,
  writeStore,
  type TaxonomyOverrideField,
} from "@/lib/store";
import {
  partnerDemoCompleteEvent,
  runPartnerDemo,
  runResetDemo,
  type PartnerDemoResult,
} from "@/lib/demo";
import {
  encodePartnerDemoNdjsonLine,
  PARTNER_DEMO_NDJSON_CONTENT_TYPE,
  type PartnerDemoStreamEvent,
} from "@/lib/partner-demo-progress";
import { warmShowcasePacks } from "@/lib/showcase-pack-cache";
import { syncDetectionRun } from "@/lib/sync-detection-run";
import { syncPredictionsToBackend } from "@/lib/sync-predictions";
import type { SignalType, StoreData } from "@/lib/types";
import { syncPilotSettingsToBackend } from "@/lib/sync-pilot";
import { wipeTenantDataFailSoft } from "@/lib/wipe-tenant";
import { getStateMode } from "@/lib/state-mode";

/**
 * After JSON showcase is live: wipe Neon leftovers, restore pilot (partner
 * baseline survives wipe), then dual-write the pack. Insights lands with
 * `replaced=1` so leftover overlay stays off until prune.
 */
function deferShowcaseNeon(result: PartnerDemoResult): void {
  after(() =>
    wipeTenantDataFailSoft(result.store.tenant.id)
      .then(async () => {
        // Wipe deletes pilot_settings — put JSON pilot back so Eval lift
        // survives Day-1 replace / cold-start hydrate after /tmp wipe.
        if (result.store.pilot) {
          await syncPilotSettingsToBackend(
            result.store.tenant.id,
            result.store.pilot
          );
        }
        await persistDeferredIngestDualWrite({
          tenantId: result.store.tenant.id,
          conversations: result.store.conversations,
          messages: result.store.messages,
          signals: result.store.signals,
          replaceShowcase: true,
          storeUpdatedAt: result.store.pilot?.updatedAt,
          lastUploadedFileName: result.store.pilot?.lastUploadedFileName,
        });
      })
      .catch((err) => {
        const detail = err instanceof Error ? err.message : "unknown error";
        console.warn(`[defer-showcase-sync] ${detail}`);
      })
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Wipe + detect + dual-write can run several minutes; stream ticks keep the browser fetch alive. */
export const maxDuration = 300;

const SIGNAL_TYPES: SignalType[] = ["lead", "retention", "upsell"];
const OVERRIDE_FIELDS: TaxonomyOverrideField[] = [
  "phrases",
  "keywords",
  "negativePhrases",
];

function streamShowcaseNdjson(
  run: (
    send: (event: PartnerDemoStreamEvent) => Promise<void>
  ) => Promise<void>,
  fallbackError: string
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = async (event: PartnerDemoStreamEvent) => {
        try {
          controller.enqueue(
            encoder.encode(encodePartnerDemoNdjsonLine(event))
          );
        } catch {
          // Client disconnected (browser timeout / navigation). Keep wipe+seed
          // running so Neon is not left empty with a stale JSON store.
          return;
        }
        if (event.type === "progress") {
          await new Promise<void>((resolve) => {
            setImmediate(resolve);
          });
        }
      };
      try {
        await run(send);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : fallbackError;
        await send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": PARTNER_DEMO_NDJSON_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function redetectWithOverrides(store: StoreData): Promise<{
  store: StoreData;
  redetectCount: number;
  job?: BackendJobStatus;
}> {
  if (detectionExecution() === "worker") {
    return { store, redetectCount: 0, job: await enqueueCanonicalDetect(store.tenant.id, store.conversations) };
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
    await persistCanonicalDetectionResume(
      store.tenant.id,
      unpublished,
      llm.skippedIds ?? [],
      store.detectionResumeUpdatedAt ?? "1970-01-01T00:00:00Z",
    );
    await writeStore({
      ...store,
      llmFailedConversationIds: unpublished,
      llmSkippedConversationIds: llm.skippedIds ?? [],
    });
    throw new Error("Classification failed. Previous published results remain active.");
  }
  const updated = useCanonicalPublication
    ? { ...store, signals: detected }
    : await replaceSignalsPreservingFeedback(detected);
  if (llm.enabled) {
    updated.llmSkippedConversationIds = llm.skippedIds ?? [];
    updated.llmFailedConversationIds = llm.failedIds ?? [];
  }
  let synced;
  try {
    synced = useCanonicalPublication
      ? await syncDetectionRun({ tenantId: store.tenant.id, conversations: store.conversations,
        messages: store.messages, signals: detected, contexts: llm.contexts,
        skippedIds: llm.skippedIds, priorSignals: store.signals })
      : await syncPredictionsToBackend(updated.signals, store.tenant.id);
  } catch (error) {
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
        await persistCanonicalDetectionResume(
          store.tenant.id,
          unpublished,
          llm.skippedIds ?? [],
          store.detectionResumeUpdatedAt ?? "1970-01-01T00:00:00Z",
        );
        await writeStore({
          ...store,
          llmFailedConversationIds: unpublished,
          llmSkippedConversationIds: llm.skippedIds ?? [],
        });
      } catch {
        // The previous cursor stays in place when this write fails.
      }
    }
    throw error;
  }
  if (useCanonicalPublication && llm.enabled) {
    await persistCanonicalDetectionResume(
      store.tenant.id,
      llm.failedIds ?? [],
      llm.skippedIds ?? [],
      store.detectionResumeUpdatedAt ?? "1970-01-01T00:00:00Z",
    );
  }
  updated.signals = synced.signals;
  await writeStore(updated);
  return { store: updated, redetectCount: updated.signals.length };
}

export async function GET(request: Request) {
  const session = await requireApiSession(request, "read");
  if (session instanceof NextResponse) return session;
  return runWithTenant(session.tenantId, async () => {
    const store = await readStore();
    return NextResponse.json({
      ...store,
      signals: sortSignals(store.signals),
    });
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    baselineOpportunities?: number;
    baselineNote?: string;
    type?: SignalType;
    field?: TaxonomyOverrideField;
    value?: string;
    redetect?: boolean;
  };

  const intent =
    body.action === "reset" || body.action === "partner_demo"
      ? "destructive"
      : "mutate";
  const session = await requireApiSession(request, intent);
  if (session instanceof NextResponse) return session;
  return runWithTenant(session.tenantId, async () => {

    if (
      (body.action === "reset" || body.action === "partner_demo") &&
      getStateMode() !== "json-demo"
    ) {
      return NextResponse.json(
        { error: "Showcase reset is available only in json-demo state mode." },
        { status: 409 },
      );
    }

    if (body.action === "warmup_showcase") {
      const warmed = await warmShowcasePacks();
      return NextResponse.json({ ok: true, ...warmed });
    }

    if (body.action === "reset") {
      return streamShowcaseNdjson(async (send) => {
        const result = await runResetDemo({
          onProgress: async (event) => {
            await send({ type: "progress", ...event });
          },
        });
        deferShowcaseNeon(result);
        await send(partnerDemoCompleteEvent(result));
      }, "Reset failed");
    }

    if (body.action === "partner_demo") {
      return streamShowcaseNdjson(async (send) => {
        const result = await runPartnerDemo({
          onProgress: async (event) => {
            await send({ type: "progress", ...event });
          },
        });
        deferShowcaseNeon(result);
        await send(partnerDemoCompleteEvent(result));
      }, "Partner demo failed");
    }

    if (body.action === "set_baseline") {
      if (
        typeof body.baselineOpportunities !== "number" ||
        !Number.isFinite(body.baselineOpportunities) ||
        body.baselineOpportunities < 0
      ) {
        return NextResponse.json(
          { error: "baselineOpportunities must be a non-negative number" },
          { status: 400 }
        );
      }
      try {
        const store = await setPilotBaseline(
          body.baselineOpportunities,
          body.baselineNote
        );
        return NextResponse.json({
          ...store,
          signals: sortSignals(store.signals),
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Pilot baseline could not be saved. Please retry.";
        return NextResponse.json({ error: message }, { status: 503 });
      }
    }

    if (body.action === "add_taxonomy_override") {
      if (!body.type || !SIGNAL_TYPES.includes(body.type)) {
        return NextResponse.json(
          { error: "type must be lead | retention | upsell" },
          { status: 400 }
        );
      }
      if (!body.field || !OVERRIDE_FIELDS.includes(body.field)) {
        return NextResponse.json(
          { error: "field must be phrases | keywords | negativePhrases" },
          { status: 400 }
        );
      }
      if (typeof body.value !== "string" || !body.value.trim()) {
        return NextResponse.json(
          { error: "value is required" },
          { status: 400 }
        );
      }

      try {
        let store = await addTaxonomyOverride(
          body.type,
          body.field,
          body.value
        );
        let redetectCount: number | undefined;
        let job: BackendJobStatus | undefined;
        if (body.redetect !== false) {
          const result = await redetectWithOverrides(store);
          store = result.store;
          redetectCount = result.redetectCount;
          job = result.job;
        }
        return NextResponse.json({
          ...store,
          signals: sortSignals(store.signals),
          redetectCount,
          ...(job ? { job } : {}),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Override failed";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    if (body.action === "apply_partner_export_adapt") {
      try {
        let store = await readStore();
        if (isLivePartnerKeepSet(store.pilot?.lastUploadedFileName)) {
          return NextResponse.json(
            {
              error:
                "Sample Adapt packs stay off a real partner export. Add a phrase from the review instead.",
            },
            { status: 403 },
          );
        }
        store.taxonomyOverrides = mergeTaxonomyOverrides(
          store.taxonomyOverrides,
          PARTNER_EXPORT_ADAPT_OVERRIDES
        );
        await writeStore(store);
        await syncTaxonomyOverridesToBackend(
          store.tenant.id,
          store.taxonomyOverrides ?? {},
        );
        const result = await redetectWithOverrides(store);
        store = result.store;
        return NextResponse.json({
          ...store,
          signals: sortSignals(store.signals),
          redetectCount: result.redetectCount,
          ...(result.job ? { job: result.job } : {}),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Adapt apply failed";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    if (body.action === "apply_zerodha_batch01_adapt") {
      try {
        let store = await readStore();
        if (isLivePartnerKeepSet(store.pilot?.lastUploadedFileName)) {
          return NextResponse.json(
            {
              error:
                "Sample Adapt packs stay off a real partner export. Add a phrase from the review instead.",
            },
            { status: 403 },
          );
        }
        store.taxonomyOverrides = mergeTaxonomyOverrides(
          store.taxonomyOverrides,
          ZERODHA_BATCH01_ADAPT_OVERRIDES
        );
        await writeStore(store);
        await syncTaxonomyOverridesToBackend(
          store.tenant.id,
          store.taxonomyOverrides ?? {},
        );
        const result = await redetectWithOverrides(store);
        store = result.store;
        return NextResponse.json({
          ...store,
          signals: sortSignals(store.signals),
          redetectCount: result.redetectCount,
          ...(result.job ? { job: result.job } : {}),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Zerodha Adapt apply failed";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  });
}
