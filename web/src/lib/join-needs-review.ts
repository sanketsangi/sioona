/**
 * Join Neon predictions to JSON store signals for Shadow Mode cards.
 * Pending: needs-review order; unmatched kept as stubs when a chat exists
 * (JSON or overlay). Stale pack ids with no chat are dropped later.
 * Follow-up / Done: tenant signals, unmatched kept as stubs (JSON drift).
 */

import type {
  BackendFeedbackLabel,
  BackendPrediction,
  BackendPredictionWithFeedback,
} from "./backend-client";
import { pickAction } from "./detect";
import { isNeonStubSignalId } from "./prediction-sync";
import type { StatusFilter, TypeFilter } from "./views";
import type {
  Conversation,
  FeedbackLabel,
  Message,
  Signal,
  SignalType,
  TaxonomyOverrides,
} from "./types";

const KNOWN_TYPES = new Set<string>(["lead", "retention", "upsell"]);

function asSignalType(raw: string): SignalType {
  if (KNOWN_TYPES.has(raw)) return raw as SignalType;
  return "lead";
}

/** Minimal card when Neon has a prediction the JSON store has not mirrored yet. */
export function predictionToStubSignal(prediction: BackendPrediction): Signal {
  return {
    id: `sig_neon_${prediction.id}`,
    tenantId: prediction.tenant_id,
    conversationId: prediction.conversation_id,
    type: asSignalType(prediction.signal_type),
    score: prediction.confidence,
    confidence: prediction.confidence,
    summary: prediction.summary,
    suggestedAction: "",
    evidence: [],
    status: "new",
    createdAt: prediction.created_at,
    backendSignalId: prediction.id,
  };
}

function findJsonSignal(
  prediction: BackendPrediction,
  signals: Signal[]
): Signal | undefined {
  const byId = signals.find((s) => s.backendSignalId === prediction.id);
  if (byId) return byId;

  return signals.find(
    (s) =>
      s.conversationId === prediction.conversation_id &&
      s.type === prediction.signal_type
  );
}

/**
 * Map each needs-review prediction to a display Signal, preserving Neon order.
 * Prefers JSON match (evidence / local conversation). Unmatched Neon rows
 * become stubs so `/tmp` wipe / JSON drift still surfaces the queue; callers
 * must drop stubs with no store or overlay chat (`filterPendingWithChat`).
 * Dedupes by JSON signal id when multiple Neon rows match the same local
 * signal (re-detect / dual-write races) so queue React keys stay unique.
 */
export function joinNeedsReviewPredictions(
  predictions: BackendPrediction[],
  jsonSignals: Signal[]
): Signal[] {
  const seenJsonIds = new Set<string>();
  const joined: Signal[] = [];

  for (const prediction of predictions) {
    const matched = findJsonSignal(prediction, jsonSignals);
    if (!matched) {
      const stub = predictionToStubSignal(prediction);
      if (seenJsonIds.has(stub.id)) continue;
      seenJsonIds.add(stub.id);
      joined.push(stub);
      continue;
    }
    if (seenJsonIds.has(matched.id)) {
      continue;
    }
    // JSON already has operator feedback — leave Neon pending SoT, but do not
    // re-show as Needs Review (would strip feedback and stick StatusDot on blue).
    if (matched.feedback) {
      continue;
    }
    seenJsonIds.add(matched.id);
    joined.push({
      ...matched,
      backendSignalId: matched.backendSignalId ?? prediction.id,
      // Pending queue SoT is Neon — treat as unreviewed for UI status
      status: "new" as const,
      feedback: undefined,
    });
  }

  return joined;
}

/**
 * Hide Neon pending stubs that have no conversation in the JSON store or
 * request-scoped overlay. JSON-backed rows stay (local evidence). Stale
 * Partner Demo pack ids without a chat stay off the Shadow Mode queue.
 */
export function filterPendingWithChat(
  pending: Signal[],
  conversations: Conversation[]
): Signal[] {
  const have = new Set(conversations.map((conversation) => conversation.id));
  return pending.filter((signal) => {
    if (!isNeonStubSignalId(signal.id)) return true;
    return Boolean(signal.conversationId) && have.has(signal.conversationId);
  });
}

/** JSON signals that already have human feedback (JSON fallback). */
export function reviewedSignalsFromStore(jsonSignals: Signal[]): Signal[] {
  return jsonSignals.filter((s) => Boolean(s.feedback));
}

const FEEDBACK_LABELS = new Set<BackendFeedbackLabel>([
  "correct",
  "incorrect",
  "partially_correct",
]);

function reviewedMatchKey(signal: Pick<Signal, "conversationId" | "type">): string {
  return `${signal.conversationId}:${signal.type}`;
}

function neonReviewedKeys(rows: BackendPredictionWithFeedback[] | undefined): {
  backendIds: Set<string>;
  convTypes: Set<string>;
} {
  const backendIds = new Set<string>();
  const convTypes = new Set<string>();
  if (!rows) return { backendIds, convTypes };
  for (const row of rows) {
    if (!row.feedback || !FEEDBACK_LABELS.has(row.feedback.feedback)) continue;
    backendIds.add(row.id);
    convTypes.add(`${row.conversation_id}:${row.signal_type}`);
  }
  return { backendIds, convTypes };
}

function isNeonReviewedLocal(
  signal: Signal,
  reviewed: { backendIds: Set<string>; convTypes: Set<string> }
): boolean {
  if (signal.backendSignalId && reviewed.backendIds.has(signal.backendSignalId)) {
    return true;
  }
  return reviewed.convTypes.has(reviewedMatchKey(signal));
}

/**
 * Shadow Mode pending list for Insights: Neon needs-review join first
 * (JSON match or stub), then keep-set JSON unreviewed rows Neon missed.
 * Callers must `filterPendingWithChat` after overlay merge.
 * Reviewed (feedback) rows stay out — they belong in Follow-Up / Done.
 * Pass Neon `GET …/signals` rows so stale `/tmp` JSON without local
 * feedback cannot re-open a signal already reviewed on another instance.
 */
export function pendingQueueSignals(
  predictions: BackendPrediction[],
  jsonSignals: Signal[],
  reviewedRows?: BackendPredictionWithFeedback[]
): Signal[] {
  const fromNeon = joinNeedsReviewPredictions(predictions, jsonSignals);
  const seen = new Set(fromNeon.map((s) => s.id));
  const reviewed = neonReviewedKeys(reviewedRows);
  const localOnly: Signal[] = [];
  for (const signal of jsonSignals) {
    if (signal.feedback) continue;
    if (seen.has(signal.id)) continue;
    if (isNeonReviewedLocal(signal, reviewed)) continue;
    seen.add(signal.id);
    localOnly.push(signal);
  }
  return [...fromNeon, ...localOnly];
}

function feedbackFromRow(
  row: BackendPredictionWithFeedback
): Signal["feedback"] | undefined {
  const raw = row.feedback;
  if (!raw || !FEEDBACK_LABELS.has(raw.feedback)) return undefined;
  const note = raw.note?.trim();
  return {
    label: raw.feedback as FeedbackLabel,
    ...(note ? { note } : {}),
    reviewedAt: raw.reviewed_at,
  };
}

/**
 * Map Neon tenant signals (feedback + Acted) to display Signals.
 * Prefers JSON match for evidence / suggestedAction. Unmatched rows become
 * stubs so Follow-Up / Done survive JSON drift. Skips unreviewed rows.
 */
export function joinTenantSignals(
  rows: BackendPredictionWithFeedback[],
  jsonSignals: Signal[]
): Signal[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const joined: Signal[] = [];

  for (const row of rows) {
    const feedback = feedbackFromRow(row);
    if (!feedback) continue;
    const status = row.acted ? ("acted" as const) : ("reviewed" as const);
    const matched = findJsonSignal(row, jsonSignals);
    if (matched) {
      if (seenIds.has(matched.id)) continue;
      const key = reviewedMatchKey(matched);
      if (seenKeys.has(key)) continue;
      seenIds.add(matched.id);
      seenKeys.add(key);
      joined.push({
        ...matched,
        backendSignalId: matched.backendSignalId ?? row.id,
        status,
        feedback,
      });
      continue;
    }

    const stub: Signal = {
      ...predictionToStubSignal(row),
      status,
      feedback,
    };
    if (seenIds.has(stub.id)) continue;
    const key = reviewedMatchKey(stub);
    if (seenKeys.has(key)) continue;
    seenIds.add(stub.id);
    seenKeys.add(key);
    joined.push(stub);
  }

  return joined;
}

/**
 * Neon-joined reviewed list, then JSON reviewed rows Neon missed (dual-write).
 */
export function reviewedQueueSignals(
  rows: BackendPredictionWithFeedback[],
  jsonSignals: Signal[]
): Signal[] {
  const fromNeon = joinTenantSignals(rows, jsonSignals);
  const seenIds = new Set(fromNeon.map((s) => s.id));
  const seenKeys = new Set(fromNeon.map(reviewedMatchKey));
  const seenBackend = new Set(
    fromNeon.map((s) => s.backendSignalId).filter((id): id is string => Boolean(id))
  );
  const localOnly: Signal[] = [];
  for (const signal of reviewedSignalsFromStore(jsonSignals)) {
    if (seenIds.has(signal.id)) continue;
    if (signal.backendSignalId && seenBackend.has(signal.backendSignalId)) {
      continue;
    }
    const key = reviewedMatchKey(signal);
    if (seenKeys.has(key)) continue;
    seenIds.add(signal.id);
    seenKeys.add(key);
    localOnly.push(signal);
  }
  return [...fromNeon, ...localOnly];
}

/** Needs follow-up: Correct reviews not yet Mark Acted. */
export function followUpSignals(reviewed: Signal[]): Signal[] {
  return reviewed.filter(
    (signal) =>
      signal.feedback?.label === "correct" && signal.status !== "acted"
  );
}

/** Done: Mark Acted (display-only). */
export function doneSignals(reviewed: Signal[]): Signal[] {
  return reviewed.filter((signal) => signal.status === "acted");
}

/**
 * Resolve `?preview=` across pending + reviewed.
 * When the same id is in both (JSON unreviewed + Neon Correct), prefer the
 * reviewed copy so Follow-up Mark Acted / Feedback chip stay honest.
 */
export function resolvePreviewSignal(
  previewId: string | null | undefined,
  pending: Signal[],
  reviewed: Signal[],
): Signal | null {
  if (!previewId) return null;
  const fromPending = pending.find((s) => s.id === previewId) ?? null;
  const fromReviewed = reviewed.find((s) => s.id === previewId) ?? null;
  if (fromPending && fromReviewed) {
    return fromReviewed.feedback ? fromReviewed : fromPending;
  }
  return fromPending ?? fromReviewed;
}

export function queueSignalsForFilter(opts: {
  pending: Signal[];
  reviewed: Signal[];
  status: StatusFilter;
  type: TypeFilter;
}): {
  filtered: Signal[];
  pendingCount: number;
  followUpCount: number;
  doneCount: number;
  allCount: number;
} {
  const followUp = followUpSignals(opts.reviewed);
  const done = doneSignals(opts.reviewed);
  const pendingIds = new Set(opts.pending.map((s) => s.id));
  const reviewedOnly = opts.reviewed.filter((s) => !pendingIds.has(s.id));
  const all = [...opts.pending, ...reviewedOnly];

  let list: Signal[];
  if (opts.status === "new") {
    list = opts.pending;
  } else if (opts.status === "followup") {
    list = followUp;
  } else if (opts.status === "acted") {
    list = done;
  } else {
    list = all;
  }
  if (opts.type !== "all") {
    list = list.filter((signal) => signal.type === opts.type);
  }

  return {
    filtered: list,
    pendingCount: opts.pending.length,
    followUpCount: followUp.length,
    doneCount: done.length,
    allCount: all.length,
  };
}

/**
 * Eval keep-set conversation ids: JSON store ∪ request-scoped overlay.
 * Overlay-only chats (pending stubs after /tmp wipe) must count toward
 * week-window SignalScore. Does not write leftover packs into store.json.
 */
export function keepSetConversationIds(
  storeConversations: Conversation[],
  overlayConversations?: Conversation[] | null
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of [
    ...storeConversations,
    ...(overlayConversations ?? []),
  ]) {
    const id = row.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Conversation ids on queue rows that are missing from the JSON store. */
export function missingConversationIds(
  signals: Signal[],
  conversations: Conversation[]
): string[] {
  const have = new Set(conversations.map((conversation) => conversation.id));
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const signal of signals) {
    const id = signal.conversationId;
    if (!id || have.has(id) || seen.has(id)) continue;
    seen.add(id);
    missing.push(id);
  }
  return missing;
}

const QUOTE_MAX = 140;

function clipQuote(text: string, max = QUOTE_MAX): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

/** Last 1–2 customer utterances as Why This Fired quotes. */
export function quotesFromCustomerMessages(messages: Message[]): string[] {
  const customer = messages
    .filter((message) => message.role === "customer" && message.content.trim())
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return customer
    .slice(-2)
    .map((message) => `quote: "${clipQuote(message.content)}"`);
}

/**
 * Fill empty evidence / suggestedAction from overlay chats (JSON match wins).
 */
export function applyChatEvidenceToSignals(
  signals: Signal[],
  chats: { conversations: Conversation[]; messages: Message[] },
  overrides?: TaxonomyOverrides | null
): Signal[] {
  const messagesByConv = new Map<string, Message[]>();
  for (const message of chats.messages) {
    const list = messagesByConv.get(message.conversationId) ?? [];
    list.push(message);
    messagesByConv.set(message.conversationId, list);
  }

  return signals.map((signal) => {
    const needsEvidence = signal.evidence.length === 0;
    const needsAction = !signal.suggestedAction;
    if (!needsEvidence && !needsAction) return signal;
    const msgs = messagesByConv.get(signal.conversationId) ?? [];
    return {
      ...signal,
      suggestedAction: needsAction
        ? pickAction(signal.type, signal.score, overrides)
        : signal.suggestedAction,
      evidence: needsEvidence
        ? quotesFromCustomerMessages(msgs)
        : signal.evidence,
    };
  });
}
