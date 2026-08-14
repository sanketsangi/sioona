/**
 * Cold-start hydrate: pull conversations + messages from Neon when the JSON
 * store file is missing. Fail-soft — empty/down/404/500 → null (caller seeds
 * testing.json). Copies Neon ground_truth onto conversations + matching
 * signals; never invents GT. Taxonomy stays JSON: union Adapt fixture into
 * taxonomyOverrides before re-detect (same merge as Day-1 replace ingest).
 */

import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "@/data/fixtures/partner-export-overrides";
import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import {
  getConversations,
  getPilotSettings,
  getTenantSignals,
  type BackendConversation,
  type BackendGroundTruth,
  type BackendMessage,
  type BackendFeedbackLabel,
  type BackendPredictionWithFeedback,
} from "./backend-client";
import { runHybridDetection } from "./detect-llm";
import { mergeTaxonomyOverrides, writeStore } from "./store";
import { syncPredictionsToBackend } from "./sync-predictions";
import type {
  Conversation,
  FeedbackLabel,
  Message,
  Signal,
  StoreData,
} from "./types";

const GROUND_TRUTH_LABELS = new Set<BackendGroundTruth>([
  "lead",
  "retention",
  "upsell",
  "none",
]);

function asGroundTruth(
  value: string | null | undefined
): Conversation["groundTruth"] | undefined {
  if (!value || !GROUND_TRUTH_LABELS.has(value as BackendGroundTruth)) {
    return undefined;
  }
  return value as BackendGroundTruth;
}

const STORE_ROLES = new Set<Message["role"]>(["customer", "agent", "system"]);

export type HydratedChats = {
  conversations: Conversation[];
  messages: Message[];
};

function asStoreRole(role: string): Message["role"] | null {
  if (STORE_ROLES.has(role as Message["role"])) {
    return role as Message["role"];
  }
  return null;
}

function mapMessage(
  message: BackendMessage,
  fallbackConversationId: string
): Message | null {
  const role = asStoreRole(message.role);
  if (!role) return null;
  return {
    id: message.message_id,
    conversationId: message.conversation_id || fallbackConversationId,
    role,
    content: message.content,
    timestamp: message.timestamp,
  };
}

/** Map FastAPI list rows to JSON store records. Neon UUID `id` is unused. */
export function mapBackendConversationsToStore(
  rows: BackendConversation[],
  tenantId: string
): HydratedChats {
  const conversations: Conversation[] = [];
  const messages: Message[] = [];

  for (const row of rows) {
    const mappedMessages: Message[] = [];
    for (const backendMessage of row.messages ?? []) {
      const mapped = mapMessage(backendMessage, row.conversation_id);
      if (mapped) mappedMessages.push(mapped);
    }
    const conversation: Conversation = {
      id: row.conversation_id,
      tenantId: row.tenant_id || tenantId,
      channel: row.channel,
      startedAt: row.started_at,
      messageIds: mappedMessages.map((message) => message.id),
    };
    if (row.customer_name) {
      conversation.customerName = row.customer_name;
    }
    if (row.external_id) {
      conversation.externalId = row.external_id;
    }
    const groundTruth = asGroundTruth(row.ground_truth);
    if (groundTruth) {
      conversation.groundTruth = groundTruth;
    }
    conversations.push(conversation);
    messages.push(...mappedMessages);
  }

  return { conversations, messages };
}

const FEEDBACK_LABELS = new Set<BackendFeedbackLabel>([
  "correct",
  "incorrect",
  "partially_correct",
]);

function signalMatchKey(
  conversationId: string,
  signalType: string
): string {
  return `${conversationId}:${signalType}`;
}

function asFeedbackLabel(raw: string): FeedbackLabel | null {
  if (FEEDBACK_LABELS.has(raw as BackendFeedbackLabel)) {
    return raw as FeedbackLabel;
  }
  return null;
}

/**
 * Overlay Neon feedback (and Acted) onto detected JSON signals.
 * Match backendSignalId first, then tenant+conversationId+type.
 * Does not invent taxonomy. Conversation GT is copied separately.
 */
export function applyNeonFeedbackToSignals(
  signals: Signal[],
  rows: BackendPredictionWithFeedback[]
): Signal[] {
  if (signals.length === 0 || rows.length === 0) return signals;

  const byId = new Map<string, BackendPredictionWithFeedback>();
  const byConvType = new Map<string, BackendPredictionWithFeedback>();
  for (const row of rows) {
    byId.set(row.id, row);
    byConvType.set(signalMatchKey(row.conversation_id, row.signal_type), row);
  }

  return signals.map((signal) => {
    const row =
      (signal.backendSignalId
        ? byId.get(signal.backendSignalId)
        : undefined) ??
      byConvType.get(signalMatchKey(signal.conversationId, signal.type));
    const neonFeedback = row?.feedback;
    const label = neonFeedback
      ? asFeedbackLabel(neonFeedback.feedback)
      : null;
    if (!row || !neonFeedback || !label) return signal;

    const note = neonFeedback.note?.trim();
    return {
      ...signal,
      backendSignalId: signal.backendSignalId ?? row.id,
      status: row.acted ? "acted" : "reviewed",
      feedback: {
        label,
        ...(note ? { note } : {}),
        reviewedAt: neonFeedback.reviewed_at,
      },
    };
  });
}

/**
 * Copy non-null conversation groundTruth onto matching signals.
 * Never invents a label when the conversation is unlabeled.
 */
export function applyConversationGroundTruthToSignals(
  signals: Signal[],
  conversations: Conversation[]
): Signal[] {
  if (signals.length === 0 || conversations.length === 0) return signals;
  const byId = new Map<string, Conversation["groundTruth"]>();
  for (const conversation of conversations) {
    if (conversation.groundTruth) {
      byId.set(conversation.id, conversation.groundTruth);
    }
  }
  if (byId.size === 0) return signals;
  return signals.map((signal) => {
    const groundTruth = byId.get(signal.conversationId);
    if (!groundTruth) return signal;
    return { ...signal, groundTruth };
  });
}

/** GET tenant conversations. Empty, down, or error → null (do not seed here). */
export async function fetchHydrateConversations(
  tenantId: string
): Promise<HydratedChats | null> {
  try {
    const rows = await getConversations(tenantId);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return mapBackendConversationsToStore(rows, tenantId);
  } catch {
    return null;
  }
}

/**
 * Build a JSON store from Neon chats, re-detect, dual-write predictions, persist.
 * Returns null when Neon has no rows or is unreachable.
 */
export async function tryHydrateStoreFromNeon(): Promise<StoreData | null> {
  const tenantId = emptyShowcaseStore.tenant.id;
  const chats = await fetchHydrateConversations(tenantId);
  if (!chats) return null;

  const taxonomyOverrides = mergeTaxonomyOverrides(
    emptyShowcaseStore.taxonomyOverrides,
    PARTNER_EXPORT_ADAPT_OVERRIDES
  );

  let signals: Signal[] = [];
  const testSleep = process.env.VITEST
    ? { sleep: async () => undefined }
    : undefined;

  try {
    const detected = await runHybridDetection(
      chats.conversations,
      chats.messages,
      tenantId,
      taxonomyOverrides
    );
    signals = detected.signals;
    const synced = await syncPredictionsToBackend(
      signals,
      tenantId,
      testSleep
    );
    signals = synced.signals;
    try {
      const rows = await getTenantSignals(tenantId);
      if (Array.isArray(rows) && rows.length > 0) {
        signals = applyNeonFeedbackToSignals(signals, rows);
      }
    } catch {
      // Fail-soft: chats + signals still persist; chips stay Pending.
    }
    signals = applyConversationGroundTruthToSignals(
      signals,
      chats.conversations
    );
  } catch {
    // Keep chats (+ any signals assigned before the throw). Do not seed testing.json.
  }

  const store: StoreData = {
    ...structuredClone(emptyShowcaseStore),
    conversations: chats.conversations,
    messages: chats.messages,
    signals,
    taxonomyOverrides,
  };

  try {
    const remote = await getPilotSettings(tenantId);
    if (remote) {
      store.pilot = {
        baselineOpportunities: remote.baseline_opportunities,
        ...(remote.baseline_note
          ? { baselineNote: remote.baseline_note }
          : {}),
        ...(remote.weekly_export_count != null
          ? { weeklyExportCount: remote.weekly_export_count }
          : {}),
        updatedAt: remote.updated_at,
      };
    }
  } catch {
    // Fail-soft: keep emptyShowcaseStore.pilot (baseline 0, no export count).
  }

  await writeStore(store);
  return store;
}
