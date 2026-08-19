import { NextResponse } from "next/server";
import {
  BackendClientError,
  type BackendPredictionWithFeedback,
  setPredictionActed,
} from "@/lib/backend-client";
import { neonPredictionIdFromStubSignalId } from "@/lib/prediction-sync";
import { readStore, setSignalActed } from "@/lib/store";
import type { FeedbackLabel, Signal, SignalType } from "@/lib/types";
import { resolveFeedbackSignal } from "../feedback/route";

const FEEDBACK_LABELS = new Set<FeedbackLabel>([
  "correct",
  "incorrect",
  "partially_correct",
]);

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

function asSignalType(raw: unknown): SignalType {
  if (raw === "lead" || raw === "retention" || raw === "upsell") return raw;
  return "lead";
}

function neonOnlyActedSignal(
  id: string,
  row: BackendPredictionWithFeedback,
  acted: boolean
): Signal {
  const label = asFeedbackLabel(row.feedback?.feedback);
  const note = row.feedback?.note?.trim();
  return {
    id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    type: asSignalType(row.signal_type),
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
  const message =
    err instanceof BackendClientError
      ? err.message
      : "Failed to save acted status to Signal Score backend";
  const status =
    err instanceof BackendClientError && err.status === 404
      ? 404
      : err instanceof BackendClientError && err.status === 400
        ? 400
        : 503;
  return NextResponse.json({ error: message }, { status });
}

/**
 * Shadow Mode: persist `status: acted` (or undo to reviewed).
 * Resolves JSON by id / Neon UUID / conversation+type (same as feedback).
 * JSON update when a reviewed row exists (fail-soft). Neon Acted is SoT
 * across instances — neon-only `setPredictionActed` when JSON is missing
 * or unreviewed after neon-only Correct.
 * Does not call Intercom/WhatsApp/email or execute suggestedAction.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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
  const neonStubId = neonPredictionIdFromStubSignalId(id);
  const bodyBackendId = body.backendSignalId?.trim() || undefined;

  if (existing) {
    const result = await setSignalActed(existing.id, body.acted);
    if (result.ok) {
      const backendSignalId =
        result.signal.backendSignalId?.trim() ||
        bodyBackendId ||
        neonStubId ||
        undefined;
      if (backendSignalId) {
        try {
          await setPredictionActed(
            result.signal.tenantId,
            backendSignalId,
            body.acted
          );
        } catch {
          // JSON is still a local mirror; Neon Acted is SoT once hydrate runs.
        }
      }
      return NextResponse.json({ signal: result.signal });
    }
    if (result.reason !== "not_reviewed") {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }
    // JSON row exists but has no feedback (neon-only Correct) — fall through.
  }

  const predictionId =
    neonStubId || bodyBackendId || existing?.backendSignalId?.trim() || undefined;
  if (!predictionId) {
    if (existing) {
      return NextResponse.json(
        { error: "Signal must be reviewed before marking acted" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  try {
    const row = await setPredictionActed(
      store.tenant.id,
      predictionId,
      body.acted
    );
    const mirror = store.signals.find(
      (s) => s.backendSignalId === row.id && s.feedback
    );
    if (mirror) {
      const mirrored = await setSignalActed(mirror.id, body.acted);
      if (mirrored.ok) {
        return NextResponse.json({ signal: mirrored.signal, neonOnly: false });
      }
    }
    return NextResponse.json({
      signal: neonOnlyActedSignal(id, row, body.acted),
      neonOnly: true,
    });
  } catch (err) {
    return actedErrorResponse(err);
  }
}
