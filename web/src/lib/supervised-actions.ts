import { primaryQuote } from "./format";
import type {
  ActionLogEvent,
  ActionLogEventKind,
  Conversation,
  Signal,
  StoreData,
  SupervisedAction,
  SupervisedActionDecision,
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
 * Short, polite, finance-appropriate retention email.
 * Display-only until a human records Approve — never sent by this module.
 */
export function composeRetentionEmailDraft(
  input: RetentionEmailDraftInput,
): RetentionEmailDraft {
  const name = greetingName(input.customerName);
  const rawQuote = primaryQuote(input.evidence ?? [])?.trim() ?? "";
  const evidenceQuote = rawQuote ? clipEmailQuote(rawQuote) : "";
  const subject = "Checking in on your account";
  const mention = evidenceQuote
    ? `I wanted to follow up after you mentioned “${evidenceQuote}”.`
    : "I wanted to follow up on your recent conversation.";
  const body = [
    `Hi ${name},`,
    "",
    `${mention} If something isn’t working the way you expected, I would like to help put it right.`,
    "",
    "Would a brief call this week be convenient?",
    "",
    "Best regards",
  ].join("\n");
  return { subject, body, evidenceQuote };
}

export function actionKey(
  conversationId: string,
  type: SupervisedAction["type"] = "retention_email_draft",
): string {
  return `${conversationId}:${type}`;
}

export function findSupervisedAction(
  actions: SupervisedAction[] | undefined,
  signal: Pick<Signal, "id" | "conversationId">,
): SupervisedAction | undefined {
  const list = actions ?? [];
  return (
    list.find((action) => action.signalId === signal.id) ??
    list.find(
      (action) =>
        action.conversationId === signal.conversationId &&
        action.type === "retention_email_draft",
    )
  );
}

/** True when the queue CTA is Approve (Retention Email), else Review. */
export function isQueueApproveSignal(
  signal: Pick<Signal, "id" | "conversationId" | "type" | "confidence">,
  actions?: SupervisedAction[] | null,
): boolean {
  if (findSupervisedAction(actions ?? undefined, signal)) return true;
  return shouldGenerateRetentionEmail(signal);
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
  conversations: Conversation[],
  conversationId: string,
): string {
  return (
    conversations.find((conversation) => conversation.id === conversationId)
      ?.customerName ?? ""
  );
}

export type EnsureSupervisedActionsResult = {
  created: SupervisedAction[];
  /** True when drafts were created, rematched, or evidence-backfilled. */
  changed: boolean;
};

/**
 * When a pending draft was created before chat evidence was available
 * (Neon stubs), fill the quote and regenerate the unedited body.
 */
function backfillPendingRetentionEvidence(
  action: SupervisedAction,
  signal: Pick<Signal, "evidence">,
  customerName: string | null | undefined,
): boolean {
  if (action.status !== "pending") return false;
  if (action.evidenceQuote.trim()) return false;
  const draft = composeRetentionEmailDraft({
    customerName,
    evidence: signal.evidence,
  });
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
 * Create missing retention-email drafts for high-confidence retention
 * signals. Existing drafts (pending or decided) are rematched to the
 * live signal id and never regenerated. Pending drafts with an empty
 * evidence quote are backfilled when chat evidence is now available.
 */
export function ensureSupervisedActions(
  store: StoreData,
  extraSignals: Signal[] = [],
  extraConversations: Conversation[] = [],
): EnsureSupervisedActionsResult {
  const conversations = [...store.conversations, ...extraConversations];
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
    if (!shouldGenerateRetentionEmail(signal)) continue;
    const key = actionKey(signal.conversationId);
    const existing = byKey.get(key);
    if (existing) {
      if (existing.signalId !== signal.id) {
        existing.signalId = signal.id;
        changed = true;
      }
      const name = customerNameForSignal(
        conversations,
        signal.conversationId,
      );
      if (backfillPendingRetentionEvidence(existing, signal, name)) {
        changed = true;
      }
      continue;
    }
    const action = createRetentionEmailAction({
      signal,
      customerName: customerNameForSignal(conversations, signal.conversationId),
      evidence: signal.evidence,
    });
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
      reason: "not_found" | "already_decided" | "invalid_body";
    };

/**
 * Record a human decision. Never sends mail.
 * `edited` keeps the draft open for re-edit / Approve / Dismiss.
 * Only `approved` and `dismissed` lock the draft.
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
  if (action.status === "approved" || action.status === "dismissed") {
    return { ok: false, reason: "already_decided" };
  }

  const nextSubject = (edits?.subject ?? action.subject).trim();
  const nextBody = (edits?.body ?? action.body).trim();
  if (!nextSubject || !nextBody) {
    return { ok: false, reason: "invalid_body" };
  }

  action.subject = nextSubject;
  action.body = nextBody;
  // Approve is always terminal — do not remap to `edited` when the copy differs.
  action.status = decision;
  action.decidedAt = nowIso();

  store.actionLogs = [
    ...(store.actionLogs ?? []),
    buildActionLogEvent(action, decision),
  ];
  logSupervisedAction(decision, action);
  return { ok: true, action };
}
