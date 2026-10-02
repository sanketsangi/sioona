import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { enterStoreTenant } from "@/lib/tenant-context";
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
import {
  mergeSignalsPreservingFeedback,
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
  const session = await requireApiSession(request, "mutate");
  if (session instanceof NextResponse) return session;
  // enterWith inside requireApiSession does not survive this await.
  // Bind the signed-in tenant on this frame so readStore/writeStore hit
  // store.<tenant>.json instead of the demo file.
  enterStoreTenant(session.tenantId);
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

    const explicitReplace = parseReplaceFlag(form);
    // Replace must not seed testing.json. That dual-write lands Groww in
    // Neon immediately before this file, and the next hydrate paints both.
    const store = await refreshStorePilotFromNeon(
      await readStore(
        explicitReplace
          ? { seedShowcase: false, syncPredictions: false }
          : undefined,
      ),
    );
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

    const priorWeeklyExportCount = store.pilot?.weeklyExportCount;
    const priorExports = priorWeeklyExportCount ?? 0;

    // Weekly packs: day-1 replace, later weeks upsert.
    // Another real upload keeps earlier Uploaded Chats and adds this file.
    // Replace when asked, or when the loaded keep-set is Sample / Partner Demo
    // / empty so demo chats are not mixed into the upload.
    const replaceShowcase = replaceShowcaseOnIngest({
      uploadedBasename: first.originalBasename,
      explicitReplace,
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

    if (llm.enabled) {
      store.llmSkippedConversationIds = llm.skippedIds ?? [];
    }
    ensureSupervisedActions(store);
    await writeStore(store);

    // JSON is written first so a Neon failure still leaves the file on disk.
    // The response waits for Neon and reports failures instead of logging them.
    const signalsToSync = store.signals.filter((signal) =>
      ingestedConversationIds.has(signal.conversationId)
    );
    let dualWrite:
      | Awaited<ReturnType<typeof persistDeferredIngestDualWrite>>
      | undefined;
    try {
      dualWrite = await persistDeferredIngestDualWrite({
        tenantId: store.tenant.id,
        conversations: ingestedConversations,
        messages: ingestedMessages,
        signals: signalsToSync,
        replaceShowcase,
        storeUpdatedAt: store.pilot?.updatedAt,
        lastUploadedFileName: store.pilot?.lastUploadedFileName,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Neon write failed";
      return NextResponse.json(
        { error: `Saved locally, but Neon did not accept the upload. ${detail}` },
        { status: 502 },
      );
    }
    const predictionSync =
      dualWrite?.predictionSync ?? emptyPredictionSyncStats();
    const conversationSync =
      dualWrite?.conversationSync ?? emptyConversationSyncStats();
    const syncError =
      predictionSync.failed > 0 || conversationSync.failed > 0
        ? "Neon did not store every chat or signal. The file is saved locally — retry the upload."
        : undefined;

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
      predictionSync,
      conversationSync,
      ...(syncError ? { syncError } : {}),
      detectLlm: llm,
      replaced: replaceShowcase,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
