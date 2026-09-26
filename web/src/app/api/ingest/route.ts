import { after, NextResponse } from "next/server";
import { persistDeferredIngestDualWrite } from "@/lib/defer-ingest-sync";
import { runHybridDetection } from "@/lib/detect-llm";
import {
  parseIngestDocument,
  toStoreRecords,
  ZERO_SIGNAL_HINT,
} from "@/lib/ingest";
import {
  appendConversationsAsDistinctFile,
  mergeConversationsByExternalId,
} from "@/lib/merge-conversations";
import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "@/data/fixtures/partner-export-overrides";
import {
  mergeSignalsPreservingFeedback,
  mergeTaxonomyOverrides,
  readStore,
  writeStore,
} from "@/lib/store";
import { ensureSupervisedActions } from "@/lib/supervised-actions";
import { sortSignals } from "@/lib/eval";
import { emptyConversationSyncStats } from "@/lib/sync-conversations";
import {
  refreshStorePilotFromNeon,
  syncPilotSettingsToBackend,
} from "@/lib/sync-pilot";
import { emptyPredictionSyncStats } from "@/lib/sync-predictions";
import {
  PARTNER_DEMO_REPLACE_CONFIRM_CODE,
  PARTNER_DEMO_REPLACE_CONFIRM_MESSAGE,
  parseConfirmPartnerDemoReplace,
  requiresPartnerDemoReplaceConfirm,
} from "@/lib/partner-demo-replace-guard";
import {
  HELD_OUT_WEEKLY_INGEST_CONFIRM_CODE,
  HELD_OUT_WEEKLY_INGEST_CONFIRM_MESSAGE,
  isPartnerWeeklyPackBasename,
  parseConfirmHeldOutWeeklyIngest,
  replaceShowcaseOnIngest,
  requiresHeldOutWeeklyIngestConfirm,
} from "@/lib/partner-weekly-pack";
import {
  catalogFileKey,
  claimCatalogBasename,
  lastUploadedFileName,
} from "@/lib/upload-filename";
import { listUploadedChatFiles } from "@/lib/vault-file";

function parseReplaceFlag(form: FormData): boolean {
  const value = form.get("replace");
  return value === "true" || value === "1";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form
      .getAll("file")
      .filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const parsedFiles: {
      format: string;
      basename?: string;
      parsed: ReturnType<typeof parseIngestDocument>["conversations"];
    }[] = [];
    for (const file of files) {
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
      parsedFiles.push({
        format,
        basename: lastUploadedFileName(file.name),
        parsed,
      });
    }

    const store = await refreshStorePilotFromNeon(await readStore());
    const drafts = parsedFiles.map((entry) => {
      const incoming = toStoreRecords(entry.parsed, store.tenant.id, {
        stableIds: true,
      });
      return {
        format: entry.format,
        originalBasename: entry.basename,
        isWeekly: isPartnerWeeklyPackBasename(entry.basename),
        incoming,
      };
    });

    if (drafts.some((entry) => entry.incoming.conversations.length === 0)) {
      return NextResponse.json(
        {
          error:
            "No usable conversations found. Each conversation needs at least one message with content.",
        },
        { status: 400 }
      );
    }

    const first = drafts[0];
    const isPartnerSamplePackUpload = first.isWeekly;

    const priorWeeklyExportCount = store.pilot?.weeklyExportCount;
    const priorExports = priorWeeklyExportCount ?? 0;

    // Weekly packs: day-1 replace, later weeks upsert.
    // Another real upload keeps earlier Uploaded Chats and adds this file.
    // Replace when asked, or when the loaded keep-set is Sample / Partner Demo
    // / empty so demo chats are not mixed into the upload.
    const replaceShowcase = replaceShowcaseOnIngest({
      uploadedBasename: first.originalBasename,
      explicitReplace: parseReplaceFlag(form),
      priorWeeklyExportCount,
      lastUploadedFileName: store.pilot?.lastUploadedFileName,
    });

    // A replace drops the previous catalog, so names are only unique inside
    // this request. A merge reserves names already listed under Uploaded Chats.
    const takenCatalogNames = new Set<string>();
    if (!replaceShowcase) {
      for (const name of listUploadedChatFiles(
        store.conversations,
        store.pilot?.lastUploadedFileName,
      )) {
        takenCatalogNames.add(catalogFileKey(name));
      }
    }
    const prepared = drafts.map((entry) => {
      const basename = claimCatalogBasename(
        entry.originalBasename,
        takenCatalogNames,
      );
      if (basename) {
        for (const conversation of entry.incoming.conversations) {
          conversation.sourceFile = basename;
        }
      }
      return {
        ...entry,
        basename,
        distinctCopy: Boolean(
          entry.originalBasename &&
            basename &&
            basename !== entry.originalBasename,
        ),
      };
    });

    const heldOutConfirmed = parseConfirmHeldOutWeeklyIngest(form);
    if (
      prepared.some((entry) =>
        requiresHeldOutWeeklyIngestConfirm({
          uploadedBasename: entry.originalBasename,
          confirmed: heldOutConfirmed,
        })
      )
    ) {
      return NextResponse.json(
        {
          error: HELD_OUT_WEEKLY_INGEST_CONFIRM_MESSAGE,
          code: HELD_OUT_WEEKLY_INGEST_CONFIRM_CODE,
        },
        { status: 409 }
      );
    }

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

    let workingConversations = store.conversations;
    let workingMessages = store.messages;
    const ingestedConversationIds = new Set<string>();

    prepared.forEach((entry, index) => {
      const replaceThis = index === 0 && replaceShowcase;
      if (replaceThis) {
        workingConversations = entry.incoming.conversations;
        workingMessages = entry.incoming.messages;
        for (const conversation of entry.incoming.conversations) {
          ingestedConversationIds.add(conversation.id);
        }
        return;
      }
      const merged = entry.distinctCopy
        ? appendConversationsAsDistinctFile(
            {
              conversations: workingConversations,
              messages: workingMessages,
            },
            entry.incoming,
          )
        : mergeConversationsByExternalId(
            {
              conversations: workingConversations,
              messages: workingMessages,
            },
            entry.incoming,
          );
      workingConversations = merged.conversations;
      workingMessages = merged.messages;
      for (const id of [...merged.replacedIds, ...merged.addedIds]) {
        ingestedConversationIds.add(id);
      }
    });

    store.conversations = workingConversations;
    store.messages = workingMessages;
    if (replaceShowcase && isPartnerSamplePackUpload) {
      store.taxonomyOverrides = mergeTaxonomyOverrides(
        store.taxonomyOverrides,
        PARTNER_EXPORT_ADAPT_OVERRIDES
      );
    }

    const ingestedConversations = store.conversations.filter((conversation) =>
      ingestedConversationIds.has(conversation.id)
    );
    const ingestedMessages = store.messages.filter((message) =>
      ingestedConversationIds.has(message.conversationId)
    );

    // Weekly partner drop-in ingest advances week-1 mid-week cadence (cold demo does not).
    // Pilot fields do not depend on detect — overlap Neon PUT with hybrid detect
    // so Upload TTFB pays max(detect, pilot) instead of sum.
    const weeklyFileCount = prepared.filter((entry) => entry.isWeekly).length;
    const lastBasename = [...prepared]
      .reverse()
      .find((entry) => entry.basename)?.basename;
    store.pilot = {
      baselineOpportunities: store.pilot?.baselineOpportunities ?? 0,
      updatedAt: new Date().toISOString(),
      weeklyExportCount:
        weeklyFileCount > 0
          ? priorExports + weeklyFileCount
          : priorWeeklyExportCount,
      ...(store.pilot?.baselineNote
        ? { baselineNote: store.pilot.baselineNote }
        : {}),
      ...(lastBasename ? { lastUploadedFileName: lastBasename } : {}),
    };

    const [{ signals: newSignals, llm }] = await Promise.all([
      runHybridDetection(
        ingestedConversations,
        ingestedMessages,
        store.tenant.id,
        store.taxonomyOverrides
      ),
      syncPilotSettingsToBackend(store.tenant.id, store.pilot),
    ]);

    if (replaceShowcase) {
      store.signals = mergeSignalsPreservingFeedback(priorSignals, newSignals);
    } else {
      const kept = priorSignals.filter(
        (signal) => !ingestedConversationIds.has(signal.conversationId)
      );
      store.signals = [
        ...kept,
        ...mergeSignalsPreservingFeedback(priorSignals, newSignals),
      ];
    }

    ensureSupervisedActions(store);
    await writeStore(store);

    // Same idea as GET / Insights/Eval: JSON is SoT for first paint.
    // Neon chats + predictions (and replace prune) run after the response.
    const signalsToSync = store.signals.filter((signal) =>
      ingestedConversationIds.has(signal.conversationId)
    );
    after(() => {
      void persistDeferredIngestDualWrite({
        tenantId: store.tenant.id,
        conversations: ingestedConversations,
        messages: ingestedMessages,
        signals: signalsToSync,
        replaceShowcase,
        storeUpdatedAt: store.pilot?.updatedAt,
        lastUploadedFileName: store.pilot?.lastUploadedFileName,
      }).catch((err) => {
        const detail = err instanceof Error ? err.message : "unknown error";
        console.warn(`[defer-ingest-sync] ${detail}`);
      });
    });

    return NextResponse.json({
      format: first.format,
      fileCount: prepared.length,
      catalogFiles: prepared.flatMap((entry) =>
        entry.basename ? [entry.basename] : [],
      ),
      importedConversations: ingestedConversations.length,
      importedMessages: ingestedMessages.length,
      newSignals: newSignals.length,
      hint: newSignals.length === 0 ? ZERO_SIGNAL_HINT : undefined,
      signals: sortSignals(store.signals),
      predictionSync: emptyPredictionSyncStats(),
      conversationSync: emptyConversationSyncStats(),
      detectLlm: llm,
      replaced: replaceShowcase,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
