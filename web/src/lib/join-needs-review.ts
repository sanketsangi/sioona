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
import { clipQuote } from "./clip-quote";
import { pickAction } from "./detect";
import { groupMessagesByConversation } from "./group-messages";
import { resolveSuggestedAction } from "./suggested-action-display";
import type { StatusFilter, TypeFilter, ActionFilter } from "./views";
import { queueActionKindForSignal } from "./queue-action-kind";
import { findSupervisedAction } from "./supervised-actions";
import type {
  Conversation,
  FeedbackLabel,
  Message,
  Signal,
  SignalType,
  SupervisedAction,
  TaxonomyOverrides,
} from "./types";

const KNOWN_TYPES = new Set<string>(["lead", "retention", "upsell"]);

function asSignalType(raw: string): SignalType | null {
  if (KNOWN_TYPES.has(raw)) return raw as SignalType;
  return null;
}

/** Minimal card when Neon has a prediction the JSON store has not mirrored yet. */
export function predictionToStubSignal(
  prediction: BackendPrediction
): Signal | null {
  const type = asSignalType(prediction.signal_type);
  if (!type) return null;
  return {
    id: `sig_neon_${prediction.id}`,
    tenantId: prediction.tenant_id,
    conversationId: prediction.conversation_id,
    type,
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

function reviewedMatchKey(signal: Pick<Signal, "conversationId" | "type">): string {
  return `${signal.conversationId}:${signal.type}`;
}

/** O(1) lookup indexes for joining Neon predictions to JSON signals. */
function buildJsonSignalIndex(signals: Signal[]): {
  byBackendId: Map<string, Signal>;
  byConvType: Map<string, Signal>;
} {
  const byBackendId = new Map<string, Signal>();
  const byConvType = new Map<string, Signal>();
  for (const signal of signals) {
    if (signal.backendSignalId) {
      byBackendId.set(signal.backendSignalId, signal);
    }
    byConvType.set(reviewedMatchKey(signal), signal);
  }
  return { byBackendId, byConvType };
}

function findJsonSignal(
  prediction: BackendPrediction,
  index: ReturnType<typeof buildJsonSignalIndex>
): Signal | undefined {
  const byId = index.byBackendId.get(prediction.id);
  if (byId) return byId;
  return index.byConvType.get(
    `${prediction.conversation_id}:${prediction.signal_type}`
  );
}

/**
 * Map each needs-review prediction to a display Signal, preserving Neon order.
 * Prefers JSON match (evidence / local conversation). Unmatched Neon rows
 * become stubs so `/tmp` wipe / JSON drift still surfaces the queue; callers
 * must drop rows whose conversation is outside the keep-set
 * (`filterPendingWithChat`).
 * Dedupes by JSON signal id when multiple Neon rows match the same local
 * signal (re-detect / dual-write races) so queue React keys stay unique.
 */
export function joinNeedsReviewPredictions(
  predictions: BackendPrediction[],
  jsonSignals: Signal[]
): Signal[] {
  const seenJsonIds = new Set<string>();
  const joined: Signal[] = [];
  const index = buildJsonSignalIndex(jsonSignals);

  for (const prediction of predictions) {
    const matched = findJsonSignal(prediction, index);
    if (!matched) {
      const stub = predictionToStubSignal(prediction);
      if (!stub) continue;
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
      // Neon row id is SoT — stale JSON UUIDs 404 Mark Acted / feedback.
      backendSignalId: prediction.id,
      // Pending queue SoT is Neon — treat as unreviewed for UI status
      status: "new" as const,
      feedback: undefined,
    });
  }

  return joined;
}

/**
 * Keep Pending, Follow-up, and Done on the active keep-set (JSON store ∪
 * wipe-only overlay). Stubs and JSON rows whose conversation is missing
 * from that set stay off the queue, so another pack cannot appear as a card.
 */
export function filterPendingWithChat(
  pending: Signal[],
  conversations: Conversation[]
): Signal[] {
  const have = new Set(conversations.map((conversation) => conversation.id));
  return pending.filter(
    (signal) =>
      Boolean(signal.conversationId) && have.has(signal.conversationId)
  );
}

/**
 * Whether Insights/Eval may fetch request-scoped Neon chats for missing
 * queue conversation ids.
 *
 * Overlay is wipe-recovery only: empty JSON + Neon still has chats.
 * When the JSON store already holds a keep-set (Sample, Partner Demo, or
 * replace-upload), never overlay leftover pack ids — that mixes corpora.
 * `replaced=1` also forces off until Neon prune finishes.
 */
export function shouldOverlayKeepSetChats(opts: {
  jsonKeepSet?: boolean;
  jsonConversationCount: number;
}): boolean {
  if (opts.jsonKeepSet) return false;
  return opts.jsonConversationCount === 0;
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
 * Needs-review is an enhancement, not a gate — empty/lagging Neon still
 * surfaces JSON-only rows so Upload → Insights can paint before dual-write.
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
  const reviewed = neonReviewedKeys(reviewedRows);
  const fromNeon = joinNeedsReviewPredictions(predictions, jsonSignals).filter(
    (signal) =>
      reviewedRows === undefined || !isNeonReviewedLocal(signal, reviewed)
  );
  const seen = new Set(fromNeon.map((s) => s.id));
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
  const index = buildJsonSignalIndex(jsonSignals);

  for (const row of rows) {
    const feedback = feedbackFromRow(row);
    if (!feedback) continue;
    const status = row.acted ? ("acted" as const) : ("reviewed" as const);
    const matched = findJsonSignal(row, index);
    if (matched) {
      if (seenIds.has(matched.id)) continue;
      const key = reviewedMatchKey(matched);
      if (seenKeys.has(key)) continue;
      seenIds.add(matched.id);
      seenKeys.add(key);
      joined.push({
        ...matched,
        // Live Neon id wins over a stale JSON UUID (wipe / instance drift).
        backendSignalId: row.id,
        status,
        feedback,
      });
      continue;
    }

    const mapped = predictionToStubSignal(row);
    if (!mapped) continue;
    const stub: Signal = {
      ...mapped,
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
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const seenBackend = new Set<string>();
  for (const signal of fromNeon) {
    seenIds.add(signal.id);
    seenKeys.add(reviewedMatchKey(signal));
    if (signal.backendSignalId) seenBackend.add(signal.backendSignalId);
  }
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

/** FNV-1a. Same id always lands in the same queue slot. */
function queueHash(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Unordered queue. Type filters already narrow the list, so the default
 * order is a stable shuffle — same signals stay put across refresh, paging,
 * and Previous / Next.
 */
export function shuffleSignals(signals: Signal[]): Signal[] {
  if (signals.length < 2) return signals;
  return [...signals].sort((a, b) => {
    const delta = queueHash(a.id) - queueHash(b.id);
    if (delta !== 0) return delta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
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
  action?: ActionFilter;
  supervisedActions?: SupervisedAction[] | null;
}): {
  filtered: Signal[];
  pendingCount: number;
  followUpCount: number;
  doneCount: number;
  allCount: number;
  approveCount: number;
  reviewCount: number;
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

  const actions = opts.supervisedActions ?? undefined;
  const action = opts.action ?? "all";
  const filtered: Signal[] = [];
  let approveCount = 0;
  let reviewCount = 0;
  for (const signal of list) {
    const kind = queueActionKindForSignal(
      signal,
      "",
      findSupervisedAction(actions, signal),
    );
    if (kind === "approve") approveCount += 1;
    if (kind === "review") reviewCount += 1;
    if (action === "all") {
      filtered.push(signal);
    } else if (action === "approve" && kind === "approve") {
      filtered.push(signal);
    } else if (action === "review" && kind === "review") {
      filtered.push(signal);
    }
  }
  const ordered = shuffleSignals(filtered);

  return {
    filtered: ordered,
    pendingCount: opts.pending.length,
    followUpCount: followUp.length,
    doneCount: done.length,
    allCount: all.length,
    approveCount,
    reviewCount,
  };
}

/**
 * Eval keep-set conversation ids: JSON store ∪ request-scoped overlay.
 * Overlay-only chats (pending stubs after /tmp wipe) must count toward
 * week-window SignalScore. Does not write leftover packs into store.json.
 */
export function keepSetConversationIds(
  storeConversations: Conversation[],
  overlayConversations?: Conversation[] | null,
  extraIds?: readonly string[] | null
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
  for (const raw of extraIds ?? []) {
    const id = raw?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Conversation ids sent to FastAPI SignalScore.
 *
 * - `replaced=1` / empty JSON: pass the explicit keep-set (JSON-only, overlay
 *   stubs, or `[]` → 0 reviewed).
 * - JSON has chats: omit ids so Neon conversations fill hydrate-lag holes
 *   (hosted n matches in-window reviews). Orphan leftover predictions stay
 *   out because they are not in `conversations`.
 */
export function signalScoreConversationIds(opts: {
  keepSetIds: string[];
  jsonKeepSet?: boolean;
  jsonConversationCount: number;
}): string[] | undefined {
  if (opts.jsonKeepSet) return opts.keepSetIds;
  if (opts.jsonConversationCount === 0) return opts.keepSetIds;
  return undefined;
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
  const messagesByConv = groupMessagesByConversation(chats.messages);
  const conversationsById = new Map(
    chats.conversations.map((conversation) => [conversation.id, conversation]),
  );

  return signals.map((signal) => {
    const needsEvidence = signal.evidence.length === 0;
    const needsAction = !signal.suggestedAction;
    if (!needsEvidence && !needsAction) return signal;
    const msgs = messagesByConv.get(signal.conversationId) ?? [];
    const evidence = needsEvidence
      ? quotesFromCustomerMessages(msgs)
      : signal.evidence;
    const hasJoin = msgs.length > 0;
    return {
      ...signal,
      suggestedAction: needsAction
        ? resolveSuggestedAction({
            type: signal.type,
            customerName:
              conversationsById.get(signal.conversationId)?.customerName,
            evidence,
            fallback: hasJoin
              ? pickAction(signal.type, signal.score, overrides)
              : "",
          })
        : signal.suggestedAction,
      evidence,
    };
  });
}
