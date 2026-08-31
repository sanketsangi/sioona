import { NextResponse } from "next/server";
import { runHybridDetection } from "@/lib/detect-llm";
import {
  parseIngestDocument,
  toStoreRecords,
  ZERO_SIGNAL_HINT,
} from "@/lib/ingest";
import { mergeConversationsByExternalId } from "@/lib/merge-conversations";
import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "@/data/fixtures/partner-export-overrides";
import {
  mergeSignalsPreservingFeedback,
  mergeTaxonomyOverrides,
  readStore,
  writeStore,
} from "@/lib/store";
import { sortSignals } from "@/lib/eval";
import {
  pruneConversationsNotInBackend,
  syncConversationsToBackend,
} from "@/lib/sync-conversations";
import {
  refreshStorePilotFromNeon,
  syncPilotSettingsToBackend,
} from "@/lib/sync-pilot";
import { syncPredictionsToBackend } from "@/lib/sync-predictions";
import {
  PARTNER_DEMO_REPLACE_CONFIRM_CODE,
  PARTNER_DEMO_REPLACE_CONFIRM_MESSAGE,
  parseConfirmPartnerDemoReplace,
  requiresPartnerDemoReplaceConfirm,
} from "@/lib/partner-demo-replace-guard";
import { lastUploadedFileName } from "@/lib/upload-filename";

function parseReplaceFlag(form: FormData): boolean {
  const value = form.get("replace");
  return value === "true" || value === "1";
}

/** Gitignored weekly partner drop-ins — Day-1 replace, mid-week upsert. */
const PARTNER_SAMPLE_PACK_BASENAMES = new Set<string>([
  "real-partner-export.local.csv",
  "real-partner-export.week2.local.csv",
  "real-partner-export.week3.local.csv",
  "real-partner-export.week4.local.csv",
  "zerodha_week_4_batch_01.json",
  "zerodha_week_4_batch_02.json",
]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const content = await file.text();
    const { format, conversations: parsed } = parseIngestDocument(
      file.name,
      content
    );
    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "No conversations found in file" },
        { status: 400 }
      );
    }

    const store = await refreshStorePilotFromNeon(await readStore());
    const incoming = toStoreRecords(parsed, store.tenant.id, {
      stableIds: true,
    });

    if (incoming.conversations.length === 0) {
      return NextResponse.json(
        {
          error:
            "No usable conversations found. Each conversation needs at least one message with content.",
        },
        { status: 400 }
      );
    }

    const uploadedBasename = lastUploadedFileName(file.name);
    const isPartnerSamplePackUpload = uploadedBasename
      ? PARTNER_SAMPLE_PACK_BASENAMES.has(uploadedBasename.toLowerCase())
      : false;

    const priorWeeklyExportCount = store.pilot?.weeklyExportCount;
    const priorExports = priorWeeklyExportCount ?? 0;

    // Weekly partner drop-ins keep showcase-overlap behavior:
    // - day-1 (first partner ingest after reset): replace
    // - mid-week re-uploads: merge/upsert (keep unmatched chats)
    //
    // Any other upload (including former eval CSVs) is a full replace:
    // conversations, messages, and signals match only the uploaded file.
    const replaceShowcase = isPartnerSamplePackUpload
      ? parseReplaceFlag(form) || priorExports === 0
      : true;

    if (
      requiresPartnerDemoReplaceConfirm({
        lastUploadedFileName: store.pilot?.lastUploadedFileName,
        willReplace: replaceShowcase,
        confirmed: parseConfirmPartnerDemoReplace(form),
      })
    ) {
      return NextResponse.json(
        {
          error: PARTNER_DEMO_REPLACE_CONFIRM_MESSAGE,
          code: PARTNER_DEMO_REPLACE_CONFIRM_CODE,
        },
        { status: 409 }
      );
    }

    const priorSignals = store.signals;

    let ingestedConversations = incoming.conversations;
    let ingestedMessages = incoming.messages;

    if (replaceShowcase) {
      store.conversations = incoming.conversations;
      store.messages = incoming.messages;
      if (isPartnerSamplePackUpload) {
        store.taxonomyOverrides = mergeTaxonomyOverrides(
          store.taxonomyOverrides,
          PARTNER_EXPORT_ADAPT_OVERRIDES
        );
      }
    } else {
      const merged = mergeConversationsByExternalId(store, incoming);
      store.conversations = merged.conversations;
      store.messages = merged.messages;
      const ingestedIds = new Set([...merged.replacedIds, ...merged.addedIds]);
      ingestedConversations = store.conversations.filter((conversation) =>
        ingestedIds.has(conversation.id)
      );
      ingestedMessages = store.messages.filter((message) =>
        ingestedIds.has(message.conversationId)
      );
    }

    const { signals: newSignals, llm } = await runHybridDetection(
      ingestedConversations,
      ingestedMessages,
      store.tenant.id,
      store.taxonomyOverrides
    );
    const [conversationSync, { signals: syncedNew, sync }] = await Promise.all([
      syncConversationsToBackend(
        ingestedConversations,
        ingestedMessages,
        store.tenant.id,
        { clearUnlabeledGroundTruth: replaceShowcase }
      ),
      syncPredictionsToBackend(newSignals, store.tenant.id),
    ]);

    if (replaceShowcase) {
      store.signals = mergeSignalsPreservingFeedback(priorSignals, syncedNew);
    } else {
      const ingestedIds = new Set(
        ingestedConversations.map((conversation) => conversation.id)
      );
      const kept = priorSignals.filter(
        (signal) => !ingestedIds.has(signal.conversationId)
      );
      store.signals = [
        ...kept,
        ...mergeSignalsPreservingFeedback(priorSignals, syncedNew),
      ];
    }

    // Weekly partner drop-in ingest advances week-1 mid-week cadence (cold demo does not).
    store.pilot = {
      baselineOpportunities: store.pilot?.baselineOpportunities ?? 0,
      updatedAt: new Date().toISOString(),
      weeklyExportCount: isPartnerSamplePackUpload
        ? priorExports + 1
        : priorWeeklyExportCount,
      ...(store.pilot?.baselineNote
        ? { baselineNote: store.pilot.baselineNote }
        : {}),
      ...(uploadedBasename ? { lastUploadedFileName: uploadedBasename } : {}),
    };

    // Dual-write pilot to Neon so /tmp wipe does not reset mid-week gate.
    await syncPilotSettingsToBackend(store.tenant.id, store.pilot);

    const conversationPrune = replaceShowcase
      ? await pruneConversationsNotInBackend(
          store.tenant.id,
          ingestedConversations.map((conversation) => conversation.id)
        )
      : undefined;

    await writeStore(store);

    return NextResponse.json({
      format,
      importedConversations: ingestedConversations.length,
      importedMessages: ingestedMessages.length,
      newSignals: newSignals.length,
      hint: newSignals.length === 0 ? ZERO_SIGNAL_HINT : undefined,
      signals: sortSignals(store.signals),
      predictionSync: sync,
      conversationSync,
      conversationPrune,
      detectLlm: llm,
      replaced: replaceShowcase,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
