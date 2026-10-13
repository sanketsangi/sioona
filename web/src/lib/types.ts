export type SignalType = "lead" | "retention" | "upsell";

/** Canonical SignalScore feedback labels (FastAPI / Neon SoT). */
export type FeedbackLabel = "correct" | "incorrect" | "partially_correct";

export type SignalStatus = "new" | "reviewed" | "acted";

export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "customer" | "agent" | "system";
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  tenantId: string;
  externalId?: string;
  channel: string;
  customerName?: string;
  startedAt: string;
  messageIds: string[];
  /** Basename of the partner file this chat was ingested from. */
  sourceFile?: string;
  /** Optional label for eval fixtures */
  groundTruth?: SignalType | "none";
}

export type SignalOutcome =
  | "retained"
  | "churned"
  | "converted"
  | "no_change"
  | "unknown";

export interface SignalOutcomeRecord {
  outcome: SignalOutcome;
  valueInr?: number;
  recordedAt?: string;
}

export interface Signal {
  /** Superseded snapshot prediction: retained for reporting, cannot be edited. */
  historical?: boolean;
  detectionContext?: import("./recent-transcript").TranscriptContext & {
    promptVersion: string;
    model: string;
    stage?: "detect";
    routeVersion?: string;
  };
  id: string;
  tenantId: string;
  conversationId: string;
  type: SignalType;
  score: number;
  confidence: number;
  summary: string;
  suggestedAction: string;
  evidence: string[];
  /** Reconstructed server anchors. Absent on local-only signals. */
  evidenceStatus?: "valid" | "unresolved" | "stale";
  evidenceSpans?: {
    messageId: string;
    start: number;
    end: number;
    quote?: string | null;
  }[];
  status: SignalStatus;
  createdAt: string;
  /** UUID from FastAPI `signal_predictions` when dual-written */
  backendSignalId?: string;
  /** high / medium / low. Omitted on older rows. */
  urgency?: "high" | "medium" | "low";
  /** Timeframe the customer stated, when there is one. */
  urgencyTimeframe?: string;
  /** Rupee amount or portfolio size stated in the chat. */
  mentionedValueInr?: number;
  commercialValueEvidence?: { messageId: string; quote: string; amountInr: number; category: "asset" | "revenue_opportunity" | "unconfirmed" }[];
  feedback?: {
    label: FeedbackLabel;
    note?: string;
    reviewedAt: string;
  };
  /** Present on labeled eval fixtures */
  groundTruth?: SignalType | "none";
  /** What happened after review. Feeds revenue at risk / revenue saved. */
  outcome?: SignalOutcomeRecord;
}

/**
 * Last deferred prediction dual-write that did not fully land.
 * Next Insights load feeds this into the existing `syncFailed` banner.
 * Cleared when a later sync reports zero failures.
 */
export interface PredictionSyncFailure {
  failed: number;
  created: number;
}

/** Partner-agreed opportunity count from their current process. */
export interface PilotSettings {
  baselineOpportunities: number;
  baselineNote?: string;
  updatedAt?: string;
  /** Successful partner file ingests (not cold demo) — mid-week cadence. */
  weeklyExportCount?: number;
  /** Last partner ingest `File.name` (JSON only; not Neon). */
  lastUploadedFileName?: string;
}

/** Additive terms merged into base taxonomy for pragmatic domain adaptation. */
export interface TaxonomyTypeOverride {
  phrases?: string[];
  keywords?: string[];
  negativePhrases?: string[];
}

export type TaxonomyOverrides = Partial<
  Record<SignalType, TaxonomyTypeOverride>
>;

/** Audit actions we currently record (kept minimal for Phase 1 compliance). */
export type AuditAction = "signal_feedback";

/**
 * Lightweight, append-only audit trail entry.
 * Phase 1 compliance: capture who/what changed a signal's review state.
 */
export interface AuditEvent {
  id: string;
  action: AuditAction;
  signalId: string;
  conversationId?: string;
  signalType?: SignalType;
  label: FeedbackLabel;
  timestamp: string;
}

/**
 * Supervised Action kinds on this record. Do not invent a parallel store.
 * `retention_email_draft` stays the high-confidence retention email.
 */
export type SupervisedActionType =
  | "retention_email_draft"
  | "retention_followup_draft"
  | "lead_outreach_draft"
  | "upsell_note_draft";

/** Human decision on a generated draft. Nothing is sent until approved. */
export type SupervisedActionDecision = "approved" | "edited" | "dismissed";

export type SupervisedActionStatus = "pending" | SupervisedActionDecision;

/**
 * Stored supervised action. Generated from existing Detect output;
 * never executes outbound (Approve records intent only).
 */
export interface SupervisedAction {
  id: string;
  type: SupervisedActionType;
  signalId: string;
  conversationId: string;
  tenantId: string;
  subject: string;
  body: string;
  /** Immutable copy used to tell approved vs edited. */
  generatedSubject: string;
  generatedBody: string;
  evidenceQuote: string;
  status: SupervisedActionStatus;
  createdAt: string;
  decidedAt?: string;
}

/** Append-only evaluation log for generated drafts and human decisions. */
export type ActionLogEventKind = "generated" | SupervisedActionDecision;

export interface ActionLogEvent {
  id: string;
  actionId: string;
  signalId: string;
  conversationId?: string;
  type: SupervisedActionType;
  event: ActionLogEventKind;
  subject: string;
  body: string;
  timestamp: string;
}

export interface StoreData {
  tenant: Tenant;
  conversations: Conversation[];
  messages: Message[];
  signals: Signal[];
  pilot?: PilotSettings;
  /** Set inside `after()` when deferred prediction dual-write fails. */
  predictionSyncFailure?: PredictionSyncFailure;
  taxonomyOverrides?: TaxonomyOverrides;
  /** Append-only compliance log (e.g. SignalScore feedback events). */
  auditEvents?: AuditEvent[];
  /** Supervised Action drafts (one per conversation + kind). */
  supervisedActions?: SupervisedAction[];
  /** Evaluation log for action generation + decisions. */
  actionLogs?: ActionLogEvent[];
  /**
   * Zero-signal chats Groq did not classify because the run hit the call cap.
   * The next re-detect classifies these before any newer misses.
   */
  llmSkippedConversationIds?: string[];
  /** Failed attempted classifications, queued ahead of new work on retry. */
  llmFailedConversationIds?: string[];
  /** Version captured with the canonical resume cursor before classification. */
  detectionResumeUpdatedAt?: string;
}
