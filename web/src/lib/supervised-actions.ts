import { pickAction } from "./detect";
import { primaryQuote } from "./format";
import { composeCustomerReplyDraft } from "./suggested-action-display";
import type {
  ActionLogEvent,
  ActionLogEventKind,
  Conversation,
  Signal,
  SignalType,
  StoreData,
  SupervisedAction,
  SupervisedActionDecision,
  SupervisedActionType,
  TaxonomyOverrides,
} from "./types";

/** Same high band as `pickAction` (≥0.75). */
export const HIGH_RETENTION_CONFIDENCE = 0.75;

/** Keep the quoted evidence short enough for a finance email. */
const MAX_EMAIL_QUOTE_CHARS = 160;

export type RetentionEmailDraft = {
  subject: string;
  body: string;
  evidenceQuote: string;
};

export type RetentionEmailDraftInput = {
  customerName?: string | null;
  evidence?: string[];
};

function greetingName(customerName: string | null | undefined): string {
  const who = (customerName ?? "").trim();
  return who || "there";
}

function clipEmailQuote(quote: string): string {
  const trimmed = quote.trim();
  if (trimmed.length <= MAX_EMAIL_QUOTE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_EMAIL_QUOTE_CHARS - 1).trimEnd()}…`;
}

/**
 * High-confidence retention only. Re-uses Detect output (type + confidence);
 * does not rescore the conversation.
 */
export function shouldGenerateRetentionEmail(
  signal: Pick<Signal, "type" | "confidence">,
): boolean {
  return (
    signal.type === "retention" &&
    Number.isFinite(signal.confidence) &&
    signal.confidence >= HIGH_RETENTION_CONFIDENCE
  );
}

/**
 * Short, desk-ready retention email a partner can Approve and paste outside
 * Sioona. Display-only until a human records Approve — never sent here.
 */
export function composeRetentionEmailDraft(
  input: RetentionEmailDraftInput,
): RetentionEmailDraft {
  const name = greetingName(input.customerName);
  const rawQuote = primaryQuote(input.evidence ?? [])?.trim() ?? "";
  const evidenceQuote = rawQuote ? clipEmailQuote(rawQuote) : "";
  const subject = evidenceQuote
    ? "Following up on your account — can we help?"
    : "Following up on your account";
  const mention = evidenceQuote
    ? `You mentioned “${evidenceQuote}”. I want to make sure we resolve this before anything gets worse.`
    : "I wanted to follow up on your recent conversation and make sure we resolve any open concerns.";
  const body = [
    `Hi ${name},`,
    "",
    mention,
    "",
    "I can review fees, settlement, or account options with you and arrange a same-day callback if that helps.",
    "",
    "Would a brief call today or tomorrow work?",
    "",
    "Best regards",
  ].join("\n");
  return { subject, body, evidenceQuote };
}

/**
 * Kind for an emitted signal. High-confidence retention keeps the email
 * draft; lower retention, lead, and upsell each get their own kind.
 */
export function supervisedActionTypeForSignal(
  signal: Pick<Signal, "type" | "confidence">,
): SupervisedActionType | null {
  if (signal.type === "lead") return "lead_outreach_draft";
  if (signal.type === "upsell") return "upsell_note_draft";
  if (signal.type === "retention") {
    return shouldGenerateRetentionEmail(signal)
      ? "retention_email_draft"
      : "retention_followup_draft";
  }
  return null;
}

/** True when this signal should have a supervised draft. */
export function shouldGenerateSupervisedDraft(
  signal: Pick<Signal, "type" | "confidence">,
): boolean {
  return supervisedActionTypeForSignal(signal) != null;
}

export function signalTypeForSupervisedAction(
  type: SupervisedActionType,
): SignalType {
  if (type === "lead_outreach_draft") return "lead";
  if (type === "upsell_note_draft") return "upsell";
  return "retention";
}

/**
 * Confidence used when a Neon stub omits it. Email stays at the high
 * band; a follow-up must stay below that band so it is not promoted.
 */
export function defaultConfidenceForStoredAction(
  type: SupervisedActionType,
): number {
  if (type === "retention_email_draft") return HIGH_RETENTION_CONFIDENCE;
  return 0.5;
}

export type PlaybookDraftInput = {
  type: SignalType;
  score: number;
  customerName?: string | null;
  evidence?: string[];
  overrides?: TaxonomyOverrides | null;
};

/**
 * Display-only draft for lead, upsell, and lower-confidence retention.
 * Subject is the taxonomy playbook line. Body is the customer reply when
 * a Why quote exists; otherwise the playbook line. Never sent.
 */
export function composePlaybookDraft(
  input: PlaybookDraftInput,
): RetentionEmailDraft {
  const playbook = pickAction(input.type, input.score, input.overrides);
  const rawQuote = primaryQuote(input.evidence ?? [])?.trim() ?? "";
  const evidenceQuote = rawQuote ? clipEmailQuote(rawQuote) : "";
  const reply = composeCustomerReplyDraft({
    type: input.type,
    customerName: input.customerName,
    evidence: input.evidence,
  });
  return {
    subject: playbook,
    body: reply || playbook,
    evidenceQuote,
  };
}

function actionIdFor(signalId: string, type: SupervisedActionType): string {
  if (type === "retention_email_draft") return `act_${signalId}`;
  return `act_${signalId}__${type}`;
}

export function actionKey(
  conversationId: string,
  type: SupervisedAction["type"] = "retention_email_draft",
): string {
  return `${conversationId}:${type}`;
}

export function findSupervisedAction(
  actions: SupervisedAction[] | undefined,
  signal: Pick<Signal, "id" | "conversationId" | "type" | "confidence">,
): SupervisedAction | undefined {
  const type = supervisedActionTypeForSignal(signal);
  if (!type) return undefined;
  const list = actions ?? [];
  return (
    list.find(
      (action) => action.signalId === signal.id && action.type === type,
    ) ??
    list.find(
      (action) =>
        action.conversationId === signal.conversationId && action.type === type,
    )
  );
}

/** True when the queue CTA is Approve (a supervised draft exists). */
export function isQueueApproveSignal(
  signal: Pick<Signal, "id" | "conversationId" | "type" | "confidence">,
  actions?: SupervisedAction[] | null,
): boolean {
  if (findSupervisedAction(actions ?? undefined, signal)) return true;
  return shouldGenerateSupervisedDraft(signal);
}

function nowIso(clock?: () => string): string {
  return clock?.() ?? new Date().toISOString();
}

export function createRetentionEmailAction(opts: {
  signal: Pick<Signal, "id" | "conversationId" | "tenantId">;
  customerName?: string | null;
  evidence?: string[];
  id?: string;
  createdAt?: string;
}): SupervisedAction {
  const draft = composeRetentionEmailDraft({
    customerName: opts.customerName,
    evidence: opts.evidence,
  });
  const createdAt = opts.createdAt ?? nowIso();
  return {
    id: opts.id ?? `act_${opts.signal.id}`,
    type: "retention_email_draft",
    signalId: opts.signal.id,
    conversationId: opts.signal.conversationId,
    tenantId: opts.signal.tenantId,
    subject: draft.subject,
    body: draft.body,
    generatedSubject: draft.subject,
    generatedBody: draft.body,
    evidenceQuote: draft.evidenceQuote,
    status: "pending",
    createdAt,
  };
}

export function createSupervisedDraftAction(opts: {
  signal: Pick<
    Signal,
    "id" | "conversationId" | "tenantId" | "type" | "confidence" | "score"
  >;
  customerName?: string | null;
  evidence?: string[];
  overrides?: TaxonomyOverrides | null;
  id?: string;
  createdAt?: string;
}): SupervisedAction | null {
  const type = supervisedActionTypeForSignal(opts.signal);
  if (!type) return null;
  if (type === "retention_email_draft") {
    return createRetentionEmailAction({
      signal: opts.signal,
      customerName: opts.customerName,
      evidence: opts.evidence,
      id: opts.id,
      createdAt: opts.createdAt,
    });
  }
  const draft = composePlaybookDraft({
    type: signalTypeForSupervisedAction(type),
    score: opts.signal.score,
    customerName: opts.customerName,
    evidence: opts.evidence,
    overrides: opts.overrides,
  });
  const createdAt = opts.createdAt ?? nowIso();
  return {
    id: opts.id ?? actionIdFor(opts.signal.id, type),
    type,
    signalId: opts.signal.id,
    conversationId: opts.signal.conversationId,
    tenantId: opts.signal.tenantId,
    subject: draft.subject,
    body: draft.body,
    generatedSubject: draft.subject,
    generatedBody: draft.body,
    evidenceQuote: draft.evidenceQuote,
    status: "pending",
    createdAt,
  };
}

export function buildActionLogEvent(
  action: SupervisedAction,
  event: ActionLogEventKind,
  clock?: () => string,
): ActionLogEvent {
  return {
    id: `alog_${action.id}_${event}_${(clock?.() ?? action.createdAt).replace(
      /[^0-9]/g,
      "",
    ).slice(-10)}`,
    actionId: action.id,
    signalId: action.signalId,
    conversationId: action.conversationId,
    type: action.type,
    event,
    subject: action.subject,
    body: action.body,
    timestamp: clock?.() ?? new Date().toISOString(),
  };
}

export function logSupervisedAction(
  kind: ActionLogEventKind,
  action: Pick<SupervisedAction, "id" | "signalId" | "type" | "status">,
): void {
  console.info("[supervised-action]", kind, {
    actionId: action.id,
    signalId: action.signalId,
    type: action.type,
    status: action.status,
  });
}

function customerNameForSignal(
  conversationsById: Map<string, Conversation>,
  conversationId: string,
): string {
  return conversationsById.get(conversationId)?.customerName ?? "";
}

export type EnsureSupervisedActionsResult = {
  created: SupervisedAction[];
  /** True when drafts were created, rematched, or evidence-backfilled. */
  changed: boolean;
};

function draftForAction(
  action: SupervisedAction,
  signal: Pick<Signal, "score" | "evidence">,
  customerName: string | null | undefined,
  overrides?: TaxonomyOverrides | null,
): RetentionEmailDraft {
  if (action.type === "retention_email_draft") {
    return composeRetentionEmailDraft({
      customerName,
      evidence: signal.evidence,
    });
  }
  return composePlaybookDraft({
    type: signalTypeForSupervisedAction(action.type),
    score: signal.score,
    customerName,
    evidence: signal.evidence,
    overrides,
  });
}

/**
 * When a pending draft was created before chat evidence was available
 * (Neon stubs), fill the quote and regenerate the unedited body.
 */
function backfillPendingEvidence(
  action: SupervisedAction,
  signal: Pick<Signal, "score" | "evidence">,
  customerName: string | null | undefined,
  overrides?: TaxonomyOverrides | null,
): boolean {
  if (action.status !== "pending") return false;
  if (action.evidenceQuote.trim()) return false;
  const draft = draftForAction(action, signal, customerName, overrides);
  if (!draft.evidenceQuote) return false;

  const unedited =
    action.subject.trim() === action.generatedSubject.trim() &&
    action.body.trim() === action.generatedBody.trim();
  action.evidenceQuote = draft.evidenceQuote;
  if (unedited) {
    action.subject = draft.subject;
    action.body = draft.body;
    action.generatedSubject = draft.subject;
    action.generatedBody = draft.body;
  }
  return true;
}

/**
 * Create missing supervised drafts for every emitted signal. Existing
 * drafts (pending or decided) are rematched to the live signal id and
 * never regenerated. Pending drafts with an empty evidence quote are
 * backfilled when chat evidence is now available.
 */
export function ensureSupervisedActions(
  store: StoreData,
  extraSignals: Signal[] = [],
  extraConversations: Conversation[] = [],
): EnsureSupervisedActionsResult {
  const conversations = [...store.conversations, ...extraConversations];
  const conversationsById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );
  const seenSignalIds = new Set<string>();
  const candidates: Signal[] = [];
  for (const signal of [...store.signals, ...extraSignals]) {
    if (seenSignalIds.has(signal.id)) continue;
    seenSignalIds.add(signal.id);
    candidates.push(signal);
  }

  const byKey = new Map<string, SupervisedAction>();
  for (const action of store.supervisedActions ?? []) {
    byKey.set(actionKey(action.conversationId, action.type), action);
  }

  const created: SupervisedAction[] = [];
  const logs = [...(store.actionLogs ?? [])];
  let changed = false;

  for (const signal of candidates) {
    const type = supervisedActionTypeForSignal(signal);
    if (!type) continue;
    const key = actionKey(signal.conversationId, type);
    const existing = byKey.get(key);
    const name = customerNameForSignal(
      conversationsById,
      signal.conversationId,
    );
    if (existing) {
      if (existing.signalId !== signal.id) {
        existing.signalId = signal.id;
        changed = true;
      }
      if (
        backfillPendingEvidence(
          existing,
          signal,
          name,
          store.taxonomyOverrides,
        )
      ) {
        changed = true;
      }
      continue;
    }
    const action = createSupervisedDraftAction({
      signal,
      customerName: name,
      evidence: signal.evidence,
      overrides: store.taxonomyOverrides,
    });
    if (!action) continue;
    byKey.set(key, action);
    created.push(action);
    changed = true;
    logs.push(buildActionLogEvent(action, "generated"));
    logSupervisedAction("generated", action);
  }

  store.supervisedActions = [
    ...(store.supervisedActions ?? []).map((action) => {
      const live = byKey.get(actionKey(action.conversationId, action.type));
      return live ?? action;
    }),
    ...created,
  ];
  store.actionLogs = logs;
  return { created, changed };
}

export function draftChangedFromGenerated(action: SupervisedAction): boolean {
  return (
    action.subject.trim() !== action.generatedSubject.trim() ||
    action.body.trim() !== action.generatedBody.trim()
  );
}

export function resolveApproveDecision(
  action: SupervisedAction,
): "approved" | "edited" {
  return draftChangedFromGenerated(action) ? "edited" : "approved";
}

export type DecideSupervisedActionResult =
  | { ok: true; action: SupervisedAction }
  | {
      ok: false;
      reason: "not_found" | "invalid_body";
    };

/**
 * Record a human decision. Never sends mail.
 * Partners may revise after Approve / Dismiss (chip updates; still not sent).
 */
export function applySupervisedActionDecision(
  store: StoreData,
  actionId: string,
  decision: SupervisedActionDecision,
  edits?: { subject?: string; body?: string },
): DecideSupervisedActionResult {
  const action = (store.supervisedActions ?? []).find(
    (item) => item.id === actionId,
  );
  if (!action) return { ok: false, reason: "not_found" };

  const nextSubject = (edits?.subject ?? action.subject).trim();
  const nextBody = (edits?.body ?? action.body).trim();
  if (!nextSubject || !nextBody) {
    return { ok: false, reason: "invalid_body" };
  }

  action.subject = nextSubject;
  action.body = nextBody;
  // Approve is always terminal for send intent — still never sends.
  // Re-decision overwrites status so Edit / Dismiss / re-Approve work.
  action.status = decision;
  action.decidedAt = nowIso();

  store.actionLogs = [
    ...(store.actionLogs ?? []),
    buildActionLogEvent(action, decision),
  ];
  logSupervisedAction(decision, action);
  return { ok: true, action };
}
