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
  /** Optional label for eval fixtures */
  groundTruth?: SignalType | "none";
}

export interface Signal {
  id: string;
  tenantId: string;
  conversationId: string;
  type: SignalType;
  score: number;
  confidence: number;
  summary: string;
  suggestedAction: string;
  evidence: string[];
  status: SignalStatus;
  createdAt: string;
  /** UUID from FastAPI `signal_predictions` when dual-written */
  backendSignalId?: string;
  feedback?: {
    label: FeedbackLabel;
    note?: string;
    reviewedAt: string;
  };
  /** Present on labeled eval fixtures */
  groundTruth?: SignalType | "none";
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
 * First supervised Action type. Add more kinds here later — do not
 * invent parallel action records.
 */
export type SupervisedActionType = "retention_email_draft";

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
  taxonomyOverrides?: TaxonomyOverrides;
  /** Append-only compliance log (e.g. SignalScore feedback events). */
  auditEvents?: AuditEvent[];
  /** Supervised Action drafts (retention email first). */
  supervisedActions?: SupervisedAction[];
  /** Evaluation log for action generation + decisions. */
  actionLogs?: ActionLogEvent[];
}
