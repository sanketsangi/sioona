import { detectionExecution } from "@/lib/detection-execution";
import { enqueueCanonicalUpload } from "@/lib/enqueue-detection";
import { getStateMode } from "@/lib/state-mode";
import { NextResponse } from "next/server";
import { signalsForPublishedConversations } from "./publication";
import { requireApiSession } from "@/lib/auth-guard";
import { runWithTenant } from "@/lib/tenant-context";
import { finalizePublishedUpload } from "@/lib/finalize-published-upload";
import { publishAtomicIngest } from "@/lib/publish-atomic-ingest";
import { getPilotSettings } from "@/lib/backend-client";
import { persistDeferredIngestDualWrite } from "@/lib/defer-ingest-sync";
import { runHybridDetectionWithLedger } from "@/lib/ai/run-with-ledger";
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
  persistCanonicalDetectionResume,
  readStore,
  writeStore,
} from "@/lib/store";
import { ensureSupervisedActions } from "@/lib/supervised-actions";
import { sortSignals } from "@/lib/eval";
import { emptyConversationSyncStats } from "@/lib/sync-conversations";
import {
  pilotSettingsFromRemote,
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
  return runWithTenant(session.tenantId, async () => {
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
          provider: entry.format,
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
      const weeklySources = prepared.flatMap((entry) =>
        entry.isWeekly && entry.basename ? [entry.basename] : [],
      );
      const lastBasename = [...prepared]
        .reverse()
        .find((entry) => entry.basename)?.basename;
      const partner = store.tenant.id !== "tenant_demo" || getStateMode() === "postgres";
      // Partner counts come from the publication receipt. Demo keeps the local
      // snapshot, and that object is what the overlapped Neon PUT receives.
      const demoPilot = partner
        ? null
        : {
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
      if (demoPilot) store.pilot = demoPilot;
      if (detectionExecution() === "worker") {
        const job = await enqueueCanonicalUpload({ tenantId: session.tenantId,
          source: lastBasename ?? "upload", replace: replaceShowcase,
          conversations: ingestedConversations, messages: ingestedMessages, weeklySources });
        return NextResponse.json({ ...job, accepted: ingestedConversations.length }, { status: 202 });
      }
      const resumeVersion = store.detectionResumeUpdatedAt ?? "1970-01-01T00:00:00Z";
      const priorFailedOutsideBatch = (store.llmFailedConversationIds ?? [])
        .filter((id) => !ingestedConversationIds.has(id));
      const priorSkippedOutsideBatch = (store.llmSkippedConversationIds ?? [])
        .filter((id) => !ingestedConversationIds.has(id));
      const resumeIds = [...new Set([
        ...(store.llmFailedConversationIds ?? []),
        ...(store.llmSkippedConversationIds ?? []),
      ])];
      const [{ signals: newSignals, llm }] = await Promise.all([
        runHybridDetectionWithLedger(
          ingestedConversations,
          ingestedMessages,
          store.tenant.id,
          store.taxonomyOverrides,
          resumeIds.length > 0 ? { resumeIds } : undefined,
        ),
        demoPilot
          ? syncPilotSettingsToBackend(store.tenant.id, demoPilot, {
              overwriteUploadMetadata: true,
            })
          : Promise.resolve(),
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
        store.llmFailedConversationIds = llm.failedIds ?? [];
      }
      ensureSupervisedActions(store);
      if (!partner) await writeStore(store);

      // Partner publication precedes the cache. Demo imports retain their local-first flow.
      const signalsToSync = signalsForPublishedConversations(
        store.signals,
        ingestedConversations
      );
      let publicationWarnings: string[] = [];
      let dualWrite:
        | Awaited<ReturnType<typeof persistDeferredIngestDualWrite>>
        | undefined;
      try {
        if (partner) {
          if (llm.failed > 0 || (llm.skippedIds?.length ?? 0) > 0) {
            await persistCanonicalDetectionResume(
              store.tenant.id,
              [...new Set([...priorFailedOutsideBatch, ...(llm.failedIds ?? [])])],
              [...new Set([...priorSkippedOutsideBatch, ...(llm.skippedIds ?? [])])],
              resumeVersion,
            );
          }
          const published = await publishAtomicIngest({ tenantId: store.tenant.id,
            source: lastBasename ?? store.pilot?.lastUploadedFileName ?? "upload", replace: replaceShowcase,
            conversations: ingestedConversations, messages: ingestedMessages, signals: signalsToSync,
            classificationFailed: llm.failed > 0, contexts: llm.contexts, skippedIds: llm.skippedIds,
            weeklySources, recordUploadMetadata: true });
          store.signals = [...store.signals.filter((signal) => !ingestedConversationIds.has(signal.conversationId)), ...published.signals];
          ensureSupervisedActions(store);
          if (published.pilot) {
            store.pilot = {
              baselineOpportunities: store.pilot?.baselineOpportunities ?? 0,
              updatedAt: new Date().toISOString(),
              ...(store.pilot?.baselineNote ? { baselineNote: store.pilot.baselineNote } : {}),
              ...(published.pilot.weeklyExportCount != null
                ? { weeklyExportCount: published.pilot.weeklyExportCount }
                : {}),
              ...(published.pilot.lastUploadedFileName
                ? { lastUploadedFileName: published.pilot.lastUploadedFileName }
                : {}),
            };
          }
          publicationWarnings = await finalizePublishedUpload({
            cache: () => writeStore(store),
            pilot: async () => {
              const remote = await getPilotSettings(store.tenant.id);
              if (!remote) throw new Error("Pilot settings could not refresh");
              store.pilot = pilotSettingsFromRemote(remote);
            },
          });
          dualWrite = {
            conversationSync: { ...emptyConversationSyncStats(), attempted: ingestedConversations.length,
              updated: ingestedConversations.length, messagesUpdated: ingestedMessages.length },
            predictionSync: { ...emptyPredictionSyncStats(), attempted: published.signals.length, updated: published.signals.length },
          };
        } else dualWrite = await persistDeferredIngestDualWrite({
          tenantId: store.tenant.id,
          publishUpload: true,
          versionDetection: store.tenant.id !== "tenant_demo",
          classificationFailed: llm.failed > 0,
          skippedIds: llm.skippedIds,
          contexts: llm.contexts,
          priorSignals,
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
          { error: partner ? `Upload publication failed. ${detail}` : `Saved locally, but Neon did not accept the upload. ${detail}` },
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
          : publicationWarnings.join(" ") || undefined;

      return NextResponse.json({
        ...(publicationWarnings.length ? { publicationWarnings } : {}),
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
  });
}
