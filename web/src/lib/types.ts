export type SignalType = "lead" | "retention" | "upsell";

export type FeedbackLabel = "accept" | "reject" | "wrong_reason";

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

export interface StoreData {
  tenant: Tenant;
  conversations: Conversation[];
  messages: Message[];
  signals: Signal[];
  pilot?: PilotSettings;
  taxonomyOverrides?: TaxonomyOverrides;
  /** Append-only compliance log (e.g. SignalScore feedback events). */
  auditEvents?: AuditEvent[];
}
