import { NextResponse } from "next/server";
import { runHybridDetection } from "@/lib/detect-llm";
import { sortSignals } from "@/lib/eval";
import {
  addTaxonomyOverride,
  readStore,
  replaceSignalsPreservingFeedback,
  resetStore,
  setPilotBaseline,
  writeStore,
  type TaxonomyOverrideField,
} from "@/lib/store";
import { runPartnerDemo } from "@/lib/demo";
import { syncPredictionsToBackend } from "@/lib/sync-predictions";
import type { SignalType } from "@/lib/types";

const SIGNAL_TYPES: SignalType[] = ["lead", "retention", "upsell"];
const OVERRIDE_FIELDS: TaxonomyOverrideField[] = [
  "phrases",
  "keywords",
  "negativePhrases",
];

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    ...store,
    signals: sortSignals(store.signals),
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

  if (body.action === "reset") {
    const store = await resetStore();
    return NextResponse.json({
      ...store,
      signals: sortSignals(store.signals),
    });
  }

  if (body.action === "partner_demo") {
    try {
      const result = await runPartnerDemo();
      return NextResponse.json({
        ...result.store,
        signals: sortSignals(result.store.signals),
        importedConversations: result.importedConversations,
        newSignals: result.newSignals,
        samples: result.samples,
        predictionSync: result.predictionSync,
        conversationSync: result.conversationSync,
        detectLlm: result.detectLlm,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Partner demo failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
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
    const store = await setPilotBaseline(
      body.baselineOpportunities,
      body.baselineNote
    );
    return NextResponse.json({
      ...store,
      signals: sortSignals(store.signals),
    });
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
      if (body.redetect !== false) {
        const { signals: detected } = await runHybridDetection(
          store.conversations,
          store.messages,
          store.tenant.id,
          store.taxonomyOverrides
        );
        store = await replaceSignalsPreservingFeedback(detected);
        const synced = await syncPredictionsToBackend(
          store.signals,
          store.tenant.id
        );
        store.signals = synced.signals;
        await writeStore(store);
        redetectCount = store.signals.length;
      }
      return NextResponse.json({
        ...store,
        signals: sortSignals(store.signals),
        redetectCount,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Override failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
