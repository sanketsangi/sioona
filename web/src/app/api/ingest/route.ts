import { NextResponse } from "next/server";
import { runHybridDetection } from "@/lib/detect-llm";
import {
  parseIngestDocument,
  toStoreRecords,
  ZERO_SIGNAL_HINT,
} from "@/lib/ingest";
import { mergeConversationsByExternalId } from "@/lib/merge-conversations";
import {
  mergeSignalsPreservingFeedback,
  readStore,
  writeStore,
} from "@/lib/store";
import { sortSignals } from "@/lib/eval";
import {
  pruneConversationsNotInBackend,
  syncConversationsToBackend,
} from "@/lib/sync-conversations";
import { syncPredictionsToBackend } from "@/lib/sync-predictions";

function parseReplaceFlag(form: FormData): boolean {
  const value = form.get("replace");
  return value === "true" || value === "1";
}

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

    const store = await readStore();
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

    const priorExports = store.pilot?.weeklyExportCount ?? 0;
    const replaceShowcase = parseReplaceFlag(form) || priorExports === 0;
    const priorSignals = store.signals;

    let ingestedConversations = incoming.conversations;
    let ingestedMessages = incoming.messages;

    if (replaceShowcase) {
      store.conversations = incoming.conversations;
      store.messages = incoming.messages;
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

    // Partner file ingest advances week-1 mid-week cadence (cold demo does not).
    store.pilot = {
      baselineOpportunities: store.pilot?.baselineOpportunities ?? 0,
      updatedAt: new Date().toISOString(),
      weeklyExportCount: priorExports + 1,
      ...(store.pilot?.baselineNote
        ? { baselineNote: store.pilot.baselineNote }
        : {}),
    };

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
