import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import {
  BackendClientError,
  createPrediction,
  type BackendPredictionWithFeedback,
  setPredictionActed,
  submitFeedback,
} from "@/lib/backend-client";
import { neonPredictionIdFromStubSignalId } from "@/lib/prediction-sync";
import {
  asSignalType,
  resolveFeedbackSignal,
} from "@/lib/resolve-feedback-signal";
import { readStore, setSignalActed, writeStore } from "@/lib/store";
import type { FeedbackLabel, Signal, SignalType } from "@/lib/types";

const FEEDBACK_LABELS = new Set<FeedbackLabel>([
  "correct",
  "incorrect",
  "partially_correct",
]);
const DEFAULT_REVIEWER = "shadow_reviewer";

type ActedBody = {
  acted?: unknown;
  /** Neon prediction UUID when JSON id drifted across Vercel instances. */
  backendSignalId?: string;
  conversationId?: string;
  type?: SignalType;
};

function asFeedbackLabel(raw: unknown): FeedbackLabel | undefined {
  if (typeof raw !== "string") return undefined;
  return FEEDBACK_LABELS.has(raw as FeedbackLabel)
    ? (raw as FeedbackLabel)
    : undefined;
}

const ACTED_TYPE_ERROR = "Signal type must be lead, retention, or upsell";

function isPredictionMissingError(err: unknown): boolean {
  return err instanceof BackendClientError && err.status === 404;
}

function isNotReviewedError(err: unknown): boolean {
  return (
    err instanceof BackendClientError &&
    err.status === 400 &&
    /must be reviewed/i.test(err.message)
  );
}

function uniqueIds(...ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function actedMissingPredictionMessage(): string {
  return "Could not save Mark Acted. Try again.";
}

function neonOnlyActedSignal(
  id: string,
  row: BackendPredictionWithFeedback,
  acted: boolean
): Signal | null {
  const type = asSignalType(row.signal_type);
  if (!type) return null;
  const label = asFeedbackLabel(row.feedback?.feedback);
  const note = row.feedback?.note?.trim();
  return {
    id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    type,
    score: row.confidence,
    confidence: row.confidence,
    summary: row.summary ?? "",
    suggestedAction: "",
    evidence: [],
    status: acted ? "acted" : "reviewed",
    createdAt: row.created_at,
    backendSignalId: row.id,
    ...(label
      ? {
          feedback: {
            label,
            ...(note ? { note } : {}),
            reviewedAt:
              row.feedback?.reviewed_at ?? new Date().toISOString(),
          },
        }
      : {}),
  };
}

function actedErrorResponse(err: unknown): NextResponse {
  if (isPredictionMissingError(err)) {
    return NextResponse.json(
      { error: actedMissingPredictionMessage() },
      { status: 404 }
    );
  }
  const message =
    err instanceof BackendClientError
      ? err.message
      : "Failed to save acted status to Signal Score backend";
  const status =
    err instanceof BackendClientError && err.status === 400 ? 400 : 503;
  return NextResponse.json({ error: message }, { status });
}

/**
 * Mark Acted; if stored Neon UUIDs 404 (wipe / JSON drift), try the live
 * card id, then upsert by conversation+type (same as feedback recovery).
 */
export async function setActedRecoveringStaleId(opts: {
  tenantId: string;
  candidateIds: string[];
  conversationId: string;
  signalType: SignalType | null;
  confidence: number;
  summary: string;
  acted: boolean;
  feedbackLabel?: FeedbackLabel;
}): Promise<{ liveId: string; row: BackendPredictionWithFeedback }> {
  let lastMissing: unknown;
  for (const predictionId of opts.candidateIds) {
    try {
      const row = await setPredictionActed(
        opts.tenantId,
        predictionId,
        opts.acted
      );
      return { liveId: row.id, row };
    } catch (err) {
      if (!isPredictionMissingError(err)) throw err;
      lastMissing = err;
    }
  }

  const signalType = asSignalType(opts.signalType);
  if (!signalType) {
    throw new BackendClientError(ACTED_TYPE_ERROR, 400);
  }

  const conversationId = opts.conversationId.trim();
  const canRecreate = Boolean(conversationId);
  if (!canRecreate) {
    throw lastMissing instanceof Error
      ? lastMissing
      : new BackendClientError("Signal not found", 404);
  }

  const created = await createPrediction(opts.tenantId, {
    conversation_id: conversationId,
    signal_type: signalType,
    confidence: clampConfidence(opts.confidence),
    summary: opts.summary.trim() || signalType,
  });

  try {
    const row = await setPredictionActed(
      opts.tenantId,
      created.id,
      opts.acted
    );
    return { liveId: created.id, row };
  } catch (err) {
    if (!isNotReviewedError(err) || !opts.feedbackLabel) throw err;
    await submitFeedback(opts.tenantId, created.id, {
      feedback: opts.feedbackLabel,
      reviewed_by: DEFAULT_REVIEWER,
    });
    const row = await setPredictionActed(
      opts.tenantId,
      created.id,
      opts.acted
    );
    return { liveId: created.id, row };
  }
}

/**
 * Shadow Mode: persist `status: acted` (or undo to reviewed).
 * Resolves JSON by id / Neon UUID / conversation+type (same as feedback).
 * Neon Acted is SoT — write FastAPI first when a prediction UUID exists,
 * then mirror JSON. Fail 503/404/400 if Neon fails so Insights (which
 * joins Follow-up / Done from `row.acted`) cannot show a false success.
 * Local-only rows (no Neon id) still persist JSON. Neon-only path when
 * JSON is missing or unreviewed after neon-only Correct.
 * Stale JSON UUIDs recover via upsert (feedback already did this).
 * Does not call Intercom/WhatsApp/email or execute suggestedAction.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request, "mutate");
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as ActedBody;

  if (typeof body.acted !== "boolean") {
    return NextResponse.json(
      { error: "acted must be true or false" },
      { status: 400 }
    );
  }

  const store = await readStore();
  const existing = resolveFeedbackSignal(store.signals, id, body);
  if (
    body.acted &&
    existing?.feedback &&
    existing.feedback.label !== "correct"
  ) {
    return NextResponse.json(
      { error: "Signal must be reviewed before marking acted" },
      { status: 400 }
    );
  }
  const neonStubId = neonPredictionIdFromStubSignalId(id);
  const bodyBackendId = body.backendSignalId?.trim() || undefined;
  const bodyConversationId = body.conversationId?.trim() || undefined;

  if (existing?.feedback) {
    const candidateIds = uniqueIds(
      bodyBackendId,
      existing.backendSignalId,
      neonStubId
    );
    if (candidateIds.length > 0) {
      try {
        const { liveId } = await setActedRecoveringStaleId({
          tenantId: existing.tenantId,
          candidateIds,
          conversationId: existing.conversationId || bodyConversationId || "",
          signalType: existing.type,
          confidence: existing.confidence,
          summary: existing.summary,
          acted: body.acted,
          feedbackLabel: existing.feedback.label,
        });
        if (existing.backendSignalId !== liveId) {
          existing.backendSignalId = liveId;
          await writeStore(store);
        }
      } catch (err) {
        return actedErrorResponse(err);
      }
    }
    const result = await setSignalActed(existing.id, body.acted);
    if (result.ok) {
      return NextResponse.json({ signal: result.signal });
    }
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }
    // Local feedback vanished between reads — fall through to Neon.
  }

  const candidateIds = uniqueIds(
    bodyBackendId,
    neonStubId,
    existing?.backendSignalId
  );
  if (candidateIds.length === 0) {
    if (existing) {
      return NextResponse.json(
        { error: "Signal must be reviewed before marking acted" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  try {
    const { liveId, row } = await setActedRecoveringStaleId({
      tenantId: store.tenant.id,
      candidateIds,
      conversationId:
        bodyConversationId || existing?.conversationId || "",
      signalType: asSignalType(body.type ?? existing?.type),
      confidence:
        typeof existing?.confidence === "number" ? existing.confidence : 0,
      summary: existing?.summary ?? "",
      acted: body.acted,
      feedbackLabel: existing?.feedback?.label,
    });
    const mirror = store.signals.find(
      (s) =>
        (s.backendSignalId === liveId || s.backendSignalId === row.id) &&
        s.feedback
    );
    if (mirror) {
      if (mirror.backendSignalId !== liveId) {
        mirror.backendSignalId = liveId;
        await writeStore(store);
      }
      const mirrored = await setSignalActed(mirror.id, body.acted);
      if (mirrored.ok) {
        return NextResponse.json({ signal: mirrored.signal, neonOnly: false });
      }
    }
    const neonSignal = neonOnlyActedSignal(
      id,
      { ...row, id: liveId },
      body.acted
    );
    if (!neonSignal) {
      return NextResponse.json({ error: ACTED_TYPE_ERROR }, { status: 400 });
    }
    return NextResponse.json({
      signal: neonSignal,
      neonOnly: true,
    });
  } catch (err) {
    return actedErrorResponse(err);
  }
}
