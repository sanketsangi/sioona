/**
 * Neon dual-write and Insights overlay for Approve / Edit / Dismiss.
 * JSON stays the local mirror. A Neon miss must not drop that mirror.
 * Nothing is sent.
 */

import {
  getSupervisedActionDecisions,
  upsertSupervisedActionDecision,
  type BackendSupervisedActionDecision,
  type BackendSupervisedActionStatus,
  type BackendSupervisedActionType,
} from "./backend-client";
import type {
  StoreData,
  SupervisedAction,
  SupervisedActionDecision,
  SupervisedActionType,
} from "./types";
import { getStateMode } from "./state-mode";

const ACTION_TYPES = new Set<SupervisedActionType>([
  "lead_outreach_draft",
  "upsell_note_draft",
  "retention_email_draft",
  "retention_followup_draft",
]);

const DECISIONS = new Set<SupervisedActionDecision>([
  "approved",
  "edited",
  "dismissed",
]);

function isActionType(value: string): value is SupervisedActionType {
  return ACTION_TYPES.has(value as SupervisedActionType);
}

function isDecision(value: string): value is SupervisedActionDecision {
  return DECISIONS.has(value as SupervisedActionDecision);
}

function actionFromRow(
  tenantId: string,
  row: BackendSupervisedActionDecision,
): SupervisedAction | null {
  if (!isActionType(row.action_type) || !isDecision(row.status)) return null;
  const subject = row.subject.trim();
  const body = row.body.trim();
  if (!subject || !body) return null;
  return {
    id: `act_neon_${row.conversation_id}__${row.action_type}`,
    type: row.action_type,
    signalId: `sig_decision_${row.conversation_id}`,
    conversationId: row.conversation_id,
    tenantId,
    subject,
    body,
    generatedSubject: subject,
    generatedBody: body,
    evidenceQuote: row.evidence_quote ?? "",
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

/**
 * Merge Neon decisions onto in-memory drafts. Matching rows update status,
 * subject, and body. JSON-only decisions stay when Neon has no row for them.
 */
export function applySupervisedDecisionOverlay(
  store: StoreData,
  rows: BackendSupervisedActionDecision[],
): void {
  const actions = [...(store.supervisedActions ?? [])];
  for (const row of rows) {
    if (!isActionType(row.action_type) || !isDecision(row.status)) continue;
    const subject = row.subject.trim();
    const body = row.body.trim();
    if (!subject || !body) continue;
    const index = actions.findIndex(
      (action) =>
        action.conversationId === row.conversation_id &&
        action.type === row.action_type,
    );
    if (index >= 0) {
      const current = actions[index];
      // A newer JSON decision stays when its Neon write has not landed yet.
      if (
        isDecision(current.status) &&
        current.decidedAt &&
        Date.parse(current.decidedAt) > Date.parse(row.decided_at)
      ) {
        continue;
      }
      actions[index] = {
        ...current,
        subject,
        body,
        evidenceQuote: row.evidence_quote ?? current.evidenceQuote,
        status: row.status,
        decidedAt: row.decided_at,
      };
      continue;
    }
    const created = actionFromRow(store.tenant.id, row);
    if (created) actions.push(created);
  }
  store.supervisedActions = actions;
}

/**
 * Read keep-set decisions and overlay them. Fetch failure leaves JSON as-is.
 */
export async function overlaySupervisedActionsFromNeon(
  store: StoreData,
  conversationIds: string[],
): Promise<void> {
  const ids = conversationIds.filter((id) => id.length > 0);
  if (ids.length === 0) return;
  try {
    const rows = await getSupervisedActionDecisions(store.tenant.id, {
      conversationIds: ids,
    });
    const allowed = new Set(ids);
    applySupervisedDecisionOverlay(
      store,
      rows.filter((row) => allowed.has(row.conversation_id)),
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    if (getStateMode() === "postgres") {
      throw new Error(`Canonical supervised decision read unavailable: ${detail}`);
    }
    console.warn(
      `[supervised-action] overlay skipped tenant=${store.tenant.id}: ${detail}`,
    );
  }
}

/**
 * Dual-write one human decision. Failure is logged and ignored so the
 * JSON write can still succeed.
 */
export async function syncSupervisedActionDecision(
  action: SupervisedAction,
): Promise<void> {
  if (!isDecision(action.status)) return;
  const subject = action.subject.trim();
  const body = action.body.trim();
  if (!subject || !body || !action.conversationId.trim()) return;
  try {
    await upsertSupervisedActionDecision(action.tenantId, {
      conversation_id: action.conversationId,
      action_type: action.type as BackendSupervisedActionType,
      status: action.status as BackendSupervisedActionStatus,
      subject,
      body,
      evidence_quote: action.evidenceQuote,
      ...(action.decidedAt ? { decided_at: action.decidedAt } : {}),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    if (getStateMode() === "postgres") {
      throw new Error(`Canonical supervised decision write unavailable: ${detail}`);
    }
    console.warn(
      `[supervised-action] dual-write failed tenant=${action.tenantId} conversation=${action.conversationId} type=${action.type}: ${detail}`,
    );
  }
}
