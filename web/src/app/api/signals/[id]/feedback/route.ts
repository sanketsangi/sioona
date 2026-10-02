import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import {
  BackendClientError,
  createPrediction,
  submitFeedback,
} from "@/lib/backend-client";
import { neonPredictionIdFromStubSignalId } from "@/lib/prediction-sync";
import {
  asSignalType,
  resolveFeedbackSignal,
} from "@/lib/resolve-feedback-signal";
import { readStore, setSignalFeedback, writeStore } from "@/lib/store";
import type { FeedbackLabel, Signal, SignalType } from "@/lib/types";

const LABELS: FeedbackLabel[] = ["correct", "incorrect", "partially_correct"];
const DEFAULT_REVIEWER = "shadow_reviewer";

type FeedbackBody = {
  label?: FeedbackLabel;
  note?: string;
  reviewed_by?: string;
  /** Neon prediction UUID when JSON id drifted across Vercel instances. */
  backendSignalId?: string;
  conversationId?: string;
  type?: SignalType;
  confidence?: number;
  summary?: string;
};

function isPredictionMissingError(err: unknown): boolean {
  return err instanceof BackendClientError && err.status === 404;
}

function feedbackPayload(
  label: FeedbackLabel,
  body: FeedbackBody
): {
  feedback: FeedbackLabel;
  reviewed_by: string;
  note?: string;
} {
  return {
    feedback: label,
    reviewed_by: body.reviewed_by?.trim() || DEFAULT_REVIEWER,
    note: body.note,
  };
}

/**
 * Submit feedback; if the stored Neon UUID is stale (wipe / instance drift),
 * upsert prediction by conversation+type and retry once.
 */
async function submitFeedbackRecoveringStaleId(opts: {
  tenantId: string;
  predictionId: string | undefined;
  conversationId: string;
  signalType: SignalType;
  confidence: number;
  summary: string;
  label: FeedbackLabel;
  body: FeedbackBody;
}): Promise<string> {
  const payload = feedbackPayload(opts.label, opts.body);
  let predictionId = opts.predictionId?.trim() || undefined;
  const canRecreate =
    Boolean(opts.conversationId.trim()) && Boolean(opts.signalType);

  if (predictionId) {
    try {
      await submitFeedback(opts.tenantId, predictionId, payload);
      return predictionId;
    } catch (err) {
      if (!isPredictionMissingError(err) || !canRecreate) throw err;
      // Stale UUID — fall through to upsert + retry.
    }
  } else if (!canRecreate) {
    throw new BackendClientError("Signal not found", 404);
  }

  const created = await createPrediction(opts.tenantId, {
    conversation_id: opts.conversationId,
    signal_type: opts.signalType,
    confidence: opts.confidence,
    summary: opts.summary,
  });
  predictionId = created.id;
  await submitFeedback(opts.tenantId, predictionId, payload);
  return predictionId;
}

function neonOnlyResponse(
  tenantId: string,
  id: string,
  backendSignalId: string,
  label: FeedbackLabel,
  note?: string
): Signal {
  return {
    id,
    tenantId,
    conversationId: "",
    type: "lead",
    score: 0,
    confidence: 0,
    summary: "",
    suggestedAction: "",
    evidence: [],
    status: "reviewed",
    createdAt: new Date().toISOString(),
    backendSignalId,
    feedback: {
      label,
      note,
      reviewedAt: new Date().toISOString(),
    },
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request, "mutate");
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as FeedbackBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

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
  const bodyBackendId = body.backendSignalId?.trim() || undefined;
  const existing = resolveFeedbackSignal(store.signals, id, body);
  const bodyConversationId = body.conversationId?.trim() || undefined;
  const bodyType = asSignalType(body.type);

  // Neon-only: stub / client UUID when JSON row is missing (hosted drift).
  if (!existing) {
    const canRecreate = Boolean(bodyConversationId && bodyType);
    const predictionId = neonStubId || bodyBackendId;

    if (!predictionId && !canRecreate) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    try {
      const liveId = await submitFeedbackRecoveringStaleId({
        tenantId: store.tenant.id,
        predictionId,
        conversationId: bodyConversationId ?? "",
        signalType: bodyType ?? "lead",
        confidence:
          typeof body.confidence === "number" && Number.isFinite(body.confidence)
            ? body.confidence
            : 0,
        summary: typeof body.summary === "string" ? body.summary : "",
        label: body.label,
        body,
      });

      const mirror = store.signals.find((s) => s.backendSignalId === liveId);
      if (mirror) {
        const signal = await setSignalFeedback(mirror.id, body.label, body.note);
        return NextResponse.json({ signal, neonOnly: false });
      }

      return NextResponse.json({
        signal: neonOnlyResponse(
          store.tenant.id,
          id,
          liveId,
          body.label,
          body.note
        ),
        neonOnly: true,
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
  }

  try {
    const liveId = await submitFeedbackRecoveringStaleId({
      tenantId: store.tenant.id,
      predictionId: existing.backendSignalId || bodyBackendId,
      conversationId: existing.conversationId,
      signalType: existing.type,
      confidence: existing.confidence,
      summary: existing.summary,
      label: body.label,
      body,
    });

    if (existing.backendSignalId !== liveId) {
      existing.backendSignalId = liveId;
      await writeStore(store);
    }
  } catch (err) {
    const message =
      err instanceof BackendClientError
        ? err.message
        : "Failed to save feedback to Signal Score backend";
    const status =
      err instanceof BackendClientError && err.status === 404 ? 404 : 503;
    return NextResponse.json({ error: message }, { status });
  }

  const signal = await setSignalFeedback(existing.id, body.label, body.note);
  if (!signal) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  return NextResponse.json({ signal });
}
