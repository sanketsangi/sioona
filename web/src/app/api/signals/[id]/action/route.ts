import { NextResponse } from "next/server";
import { resolveFeedbackSignal } from "@/app/api/signals/[id]/feedback/route";
import { neonPredictionIdFromStubSignalId } from "@/lib/prediction-sync";
import { decideSupervisedAction, persistSupervisedActions, readStore } from "@/lib/store";
import {
  defaultConfidenceForStoredAction,
  findSupervisedAction,
  shouldGenerateSupervisedDraft,
  signalTypeForSupervisedAction,
  supervisedActionTypeForSignal,
} from "@/lib/supervised-actions";
import type {
  Signal,
  SignalType,
  StoreData,
  SupervisedAction,
  SupervisedActionDecision,
} from "@/lib/types";

const DECISIONS = new Set<SupervisedActionDecision>([
  "approved",
  "edited",
  "dismissed",
]);

const KNOWN_TYPES = new Set<SignalType>(["lead", "retention", "upsell"]);

type ActionBody = {
  decision?: unknown;
  subject?: unknown;
  body?: unknown;
  backendSignalId?: string;
  conversationId?: string;
  type?: unknown;
  confidence?: unknown;
  summary?: unknown;
  evidence?: unknown;
};

function asDecision(raw: unknown): SupervisedActionDecision | null {
  if (typeof raw !== "string") return null;
  return DECISIONS.has(raw as SupervisedActionDecision)
    ? (raw as SupervisedActionDecision)
    : null;
}

function asSignalType(raw: unknown): SignalType | null {
  if (typeof raw !== "string") return null;
  return KNOWN_TYPES.has(raw as SignalType) ? (raw as SignalType) : null;
}

function asEvidence(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

function requestConfidence(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

const RETENTION_CONFIDENCE_ERROR =
  "Confidence is required to choose the retention draft.";

function bothRetentionDrafts(hits: SupervisedAction[]): boolean {
  return (
    hits.some((action) => action.type === "retention_email_draft") &&
    hits.some((action) => action.type === "retention_followup_draft")
  );
}

function pickStoredAction(
  hits: SupervisedAction[],
  body: ActionBody,
): SupervisedAction | undefined {
  if (hits.length <= 1) return hits[0];
  const requested = asSignalType(body.type);
  const confidence = requestConfidence(body.confidence);
  if (
    bothRetentionDrafts(hits) &&
    (requested == null || requested === "retention")
  ) {
    if (confidence == null) return undefined;
    const kind = supervisedActionTypeForSignal({
      type: "retention",
      confidence,
    });
    return hits.find((action) => action.type === kind);
  }
  if (requested && confidence != null) {
    const kind = supervisedActionTypeForSignal({
      type: requested,
      confidence,
    });
    const exact = hits.find((action) => action.type === kind);
    if (exact) return exact;
  }
  if (requested) {
    const typed = hits.find(
      (action) => signalTypeForSupervisedAction(action.type) === requested,
    );
    if (typed) return typed;
  }
  return hits[0];
}

function storedHitsForRequest(
  store: StoreData,
  id: string,
  body: ActionBody,
): SupervisedAction[] {
  const list = store.supervisedActions ?? [];
  const bySignal = list.filter((action) => action.signalId === id);
  if (bySignal.length > 0) return bySignal;

  const backendId = body.backendSignalId?.trim();
  if (backendId) {
    const stubId = `sig_neon_${backendId}`;
    const byBackend = list.filter(
      (action) => action.signalId === stubId || action.signalId === backendId,
    );
    if (byBackend.length > 0) return byBackend;
  }

  const conversationId = body.conversationId?.trim();
  if (!conversationId) return [];
  const requested = asSignalType(body.type);
  return list.filter((action) => {
    if (action.conversationId !== conversationId) return false;
    if (!requested) return true;
    return signalTypeForSupervisedAction(action.type) === requested;
  });
}

function findStoredAction(
  store: StoreData,
  id: string,
  body: ActionBody,
): SupervisedAction | undefined {
  const list = store.supervisedActions ?? [];
  const bySignal = pickStoredAction(
    list.filter((action) => action.signalId === id),
    body,
  );
  if (bySignal) return bySignal;

  const backendId = body.backendSignalId?.trim();
  if (backendId) {
    const stubId = `sig_neon_${backendId}`;
    const byBackend = pickStoredAction(
      list.filter(
        (action) =>
          action.signalId === stubId || action.signalId === backendId,
      ),
      body,
    );
    if (byBackend) return byBackend;
  }

  const conversationId = body.conversationId?.trim();
  if (!conversationId) return undefined;
  const requested = asSignalType(body.type);
  return pickStoredAction(
    list.filter((action) => {
      if (action.conversationId !== conversationId) return false;
      if (!requested) return true;
      return signalTypeForSupervisedAction(action.type) === requested;
    }),
    body,
  );
}

/**
 * Resolve a JSON signal, or synthesize one for Neon-only stubs when the
 * JSON row is missing (same hosted drift as feedback / Mark Acted).
 */
export function resolveActionSignal(
  store: StoreData,
  id: string,
  body: ActionBody,
): Signal | undefined {
  const fromStore = resolveFeedbackSignal(store.signals, id, {
    backendSignalId: body.backendSignalId,
    conversationId: body.conversationId,
    type: asSignalType(body.type) ?? undefined,
  });
  if (fromStore) return fromStore;

  const storedAction = findStoredAction(store, id, body);
  const conversationId =
    body.conversationId?.trim() || storedAction?.conversationId;
  if (!conversationId) return undefined;

  const type =
    asSignalType(body.type) ??
    (storedAction ? signalTypeForSupervisedAction(storedAction.type) : null);
  if (!type) return undefined;

  const confidence =
    typeof body.confidence === "number" && Number.isFinite(body.confidence)
      ? body.confidence
      : storedAction
        ? defaultConfidenceForStoredAction(storedAction.type)
        : null;
  if (confidence == null) return undefined;

  const backendSignalId =
    body.backendSignalId?.trim() ||
    neonPredictionIdFromStubSignalId(id) ||
    undefined;

  return {
    id,
    tenantId: store.tenant.id,
    conversationId,
    type,
    score: confidence,
    confidence,
    summary: typeof body.summary === "string" ? body.summary : "",
    suggestedAction: "",
    evidence: asEvidence(body.evidence),
    status: "new",
    createdAt: new Date().toISOString(),
    ...(backendSignalId ? { backendSignalId } : {}),
  };
}

/**
 * Supervised Action: generate-if-missing and record Approve / Edit / Dismiss.
 * Never sends email or executes outbound.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as ActionBody;

  try {
    const store = await readStore();
    const signal = resolveActionSignal(store, id, body);

    if (!signal) {
      const hits = storedHitsForRequest(store, id, body);
      if (
        bothRetentionDrafts(hits) &&
        requestConfidence(body.confidence) == null
      ) {
        return NextResponse.json(
          { error: RETENTION_CONFIDENCE_ERROR },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    const liveConfidence =
      requestConfidence(body.confidence) ?? signal.confidence;
    const liveSignal = {
      ...signal,
      confidence: liveConfidence,
      score: liveConfidence,
    };

    if (shouldGenerateSupervisedDraft(liveSignal)) {
      await persistSupervisedActions([liveSignal], store.conversations);
    }

    const afterEnsure = await readStore();
    const action = findSupervisedAction(
      afterEnsure.supervisedActions,
      liveSignal,
    );
    if (!action) {
      return NextResponse.json(
        { error: "No supervised draft for this signal." },
        { status: 404 }
      );
    }

    const decision = asDecision(body.decision);
    if (!decision) {
      return NextResponse.json({ action });
    }

    const subject =
      typeof body.subject === "string" ? body.subject : undefined;
    const draftBody = typeof body.body === "string" ? body.body : undefined;
    const result = await decideSupervisedAction(action.id, decision, {
      subject,
      body: draftBody,
    });

    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Action not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Subject and body are required." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      action: result.action,
      sent: false,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save action decision";
    console.error("[supervised-action] decision failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
