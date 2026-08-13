import { NextResponse } from "next/server";
import { runHybridDetection } from "@/lib/detect-llm";
import {
  parseIngestDocument,
  toStoreRecords,
  ZERO_SIGNAL_HINT,
} from "@/lib/ingest";
import { readStore, writeStore } from "@/lib/store";
import { sortSignals } from "@/lib/eval";
import { syncConversationsToBackend } from "@/lib/sync-conversations";
import { syncPredictionsToBackend } from "@/lib/sync-predictions";

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
    const { conversations, messages } = toStoreRecords(
      parsed,
      store.tenant.id
    );

    if (conversations.length === 0) {
      return NextResponse.json(
        {
          error:
            "No usable conversations found. Each conversation needs at least one message with content.",
        },
        { status: 400 }
      );
    }

    store.conversations.push(...conversations);
    store.messages.push(...messages);

    const { signals: newSignals, llm } = await runHybridDetection(
      conversations,
      messages,
      store.tenant.id,
      store.taxonomyOverrides
    );
    const [conversationSync, { signals: syncedNew, sync }] = await Promise.all([
      syncConversationsToBackend(
        conversations,
        messages,
        store.tenant.id
      ),
      syncPredictionsToBackend(newSignals, store.tenant.id),
    ]);
    store.signals.push(...syncedNew);
    // Partner file ingest advances week-1 mid-week cadence (cold demo does not).
    const priorExports = store.pilot?.weeklyExportCount ?? 0;
    store.pilot = {
      baselineOpportunities: store.pilot?.baselineOpportunities ?? 0,
      updatedAt: new Date().toISOString(),
      weeklyExportCount: priorExports + 1,
      ...(store.pilot?.baselineNote
        ? { baselineNote: store.pilot.baselineNote }
        : {}),
    };
    await writeStore(store);

    return NextResponse.json({
      format,
      importedConversations: conversations.length,
      importedMessages: messages.length,
      newSignals: newSignals.length,
      hint: newSignals.length === 0 ? ZERO_SIGNAL_HINT : undefined,
      signals: sortSignals(store.signals),
      predictionSync: sync,
      conversationSync,
      detectLlm: llm,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
