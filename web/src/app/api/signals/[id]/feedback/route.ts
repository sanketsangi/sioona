import { NextResponse } from "next/server";
import {
  BackendClientError,
  createPrediction,
  submitFeedback,
} from "@/lib/backend-client";
import { neonPredictionIdFromStubSignalId } from "@/lib/prediction-sync";
import { readStore, setSignalFeedback, writeStore } from "@/lib/store";
import type { FeedbackLabel, Signal } from "@/lib/types";

const LABELS: FeedbackLabel[] = ["correct", "incorrect", "partially_correct"];
const DEFAULT_REVIEWER = "shadow_reviewer";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    label?: FeedbackLabel;
    note?: string;
    reviewed_by?: string;
  };

  if (!body.label || !LABELS.includes(body.label)) {
    return NextResponse.json(
      {
        error:
          "label must be correct | incorrect | partially_correct",
      },
      { status: 400 }
    );
  }

  const store = await readStore();
  const neonStubId = neonPredictionIdFromStubSignalId(id);
  const existing = store.signals.find((s) => s.id === id);
  const mirrorByBackendId = neonStubId
    ? store.signals.find((s) => s.backendSignalId === neonStubId)
    : undefined;

  // Neon stub with no JSON row: submit feedback by prediction UUID only.
  if (neonStubId && !existing) {
    try {
      await submitFeedback(store.tenant.id, neonStubId, {
        feedback: body.label,
        reviewed_by: body.reviewed_by?.trim() || DEFAULT_REVIEWER,
        note: body.note,
      });
    } catch (err) {
      const message =
        err instanceof BackendClientError
          ? err.message
          : "Failed to save feedback to Signal Score backend";
      const status =
        err instanceof BackendClientError && err.status === 404 ? 404 : 503;
      return NextResponse.json({ error: message }, { status });
    }

    if (mirrorByBackendId) {
      const signal = await setSignalFeedback(
        mirrorByBackendId.id,
        body.label,
        body.note
      );
      return NextResponse.json({ signal, neonOnly: false });
    }

    const neonOnlySignal: Signal = {
      id,
      tenantId: store.tenant.id,
      conversationId: "",
      type: "lead",
      score: 0,
      confidence: 0,
      summary: "",
      suggestedAction: "",
      evidence: [],
      status: "reviewed",
      createdAt: new Date().toISOString(),
      backendSignalId: neonStubId,
      feedback: {
        label: body.label,
        note: body.note,
        reviewedAt: new Date().toISOString(),
      },
    };
    return NextResponse.json({ signal: neonOnlySignal, neonOnly: true });
  }

  if (!existing) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  let backendSignalId = existing.backendSignalId;
  if (!backendSignalId) {
    try {
      const created = await createPrediction(store.tenant.id, {
        conversation_id: existing.conversationId,
        signal_type: existing.type,
        confidence: existing.confidence,
        summary: existing.summary,
      });
      backendSignalId = created.id;
      existing.backendSignalId = backendSignalId;
      await writeStore(store);
    } catch (err) {
      const message =
        err instanceof BackendClientError
          ? err.message
          : "Failed to register prediction with Signal Score backend";
      return NextResponse.json({ error: message }, { status: 503 });
    }
  }

  try {
    await submitFeedback(store.tenant.id, backendSignalId, {
      feedback: body.label,
      reviewed_by: body.reviewed_by?.trim() || DEFAULT_REVIEWER,
      note: body.note,
    });
  } catch (err) {
    const message =
      err instanceof BackendClientError
        ? err.message
        : "Failed to save feedback to Signal Score backend";
    const status =
      err instanceof BackendClientError && err.status === 404 ? 404 : 503;
    return NextResponse.json({ error: message }, { status });
  }

  const signal = await setSignalFeedback(id, body.label, body.note);
  if (!signal) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  return NextResponse.json({ signal });
}
