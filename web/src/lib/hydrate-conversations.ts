import { fetchTenantSignals } from "./fetch-tenant-signals";
import { fetchScopedConversations } from "./fetch-scoped-conversations";
/**
 * Cold-start hydrate: pull conversations + messages from Neon when the JSON
 * store file is missing. Fail-soft — empty/down/404/500 → null (caller seeds
 * testing.json). Copies Neon ground_truth onto conversations + matching
 * signals; never invents GT. Taxonomy overrides come from the tenant store
 * (Neon when synced). Sample Adapt packs are not applied on hydrate.
 */

import { currentStoreTenant, DEMO_TENANT_ID } from "@/lib/tenant-context";
import {
  pseudonymCustomerName,
  redactText,
  safeExternalId,
  scrubCustomerName,
} from "./redact";
import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import {
  getConversations,
  getActiveUploads,
  getDetectionResume,
  getPilotSettings,
  HYDRATE_CONVERSATIONS_TIMEOUT_MS,
  type BackendConversation,
  type BackendGroundTruth,
  type BackendMessage,
  type BackendFeedbackLabel,
  type BackendPredictionWithFeedback,
} from "./backend-client";
import { predictionToStubSignal, commercialMetadataFromPrediction } from "./join-needs-review";
import { withServerEvidence } from "./server-evidence";
import { runHybridDetectionWithLedger } from "./ai/run-with-ledger";
import { pilotSettingsFromRemote } from "./sync-pilot";
import { taxonomyOverridesFromNeon } from "./sync-taxonomy";
import { writeStore } from "./store";
import { getStateMode } from "./state-mode";
import { syncPredictionsToBackend } from "./sync-predictions";
import { ensureSupervisedActions } from "./supervised-actions";
import { overlaySupervisedActionsFromNeon } from "./supervised-action-persistence";
import { bundledShowcaseConversationIds } from "./showcase-keep-set";
import { isLivePartnerKeepSet } from "./vault-file";
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
      if (!mapped) continue;
      mapped.content = scrubCustomerName(
        redactText(mapped.content),
        row.customer_name,
      );
      mappedMessages.push(mapped);
    }
    const conversation: Conversation = {
      id: row.conversation_id,
      tenantId: row.tenant_id || tenantId,
      channel: row.channel,
      startedAt: row.started_at,
      messageIds: mappedMessages.map((message) => message.id),
    };
    if (row.customer_name) {
      conversation.customerName = pseudonymCustomerName(row.customer_name);
    }
    if (row.external_id) {
      conversation.externalId = safeExternalId(
        row.external_id,
        row.customer_name,
      );
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
 * Always attach the live Neon id so stale JSON UUIDs cannot 404 Acted.
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
    if (!row) return signal;

    const withId: Signal = withServerEvidence({
      ...signal,
      // Neon row id is SoT — a stale JSON UUID 404s Mark Acted.
      backendSignalId: row.id,
      status: row.acted ? "acted" : "new",
      feedback: undefined,
      outcome: predictionToStubSignal(row)?.outcome,
      ...commercialMetadataFromPrediction(row),
    }, row);
    const neonFeedback = row.feedback;
    const label = neonFeedback
      ? asFeedbackLabel(neonFeedback.feedback)
      : null;
    if (!neonFeedback || !label) return withId;

    const note = neonFeedback.note?.trim();
    return {
      ...withId,
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

/** Keep only the conversation ids Insights still needs for the review panel. */
export function filterHydratedChats(
  chats: HydratedChats,
  keepConversationIds: string[]
): HydratedChats {
  const keep = new Set(keepConversationIds.filter(Boolean));
  const conversations = chats.conversations.filter((row) => keep.has(row.id));
  const kept = new Set(conversations.map((row) => row.id));
  const messages = chats.messages.filter((message) =>
    kept.has(message.conversationId)
  );
  return { conversations, messages };
}

/**
 * Request-scoped chat overlay for Insights when JSON is empty (wipe
 * recovery). Callers must gate with `shouldOverlayKeepSetChats` so an
 * active Sample / Partner Demo / upload keep-set never pulls leftover
 * pack chats. Does not write the store.
 */
export async function fetchOverlayConversations(
  tenantId: string,
  keepConversationIds: string[]
): Promise<HydratedChats | null> {
  if (keepConversationIds.length === 0) return null;
  try {
    const rows = await fetchScopedConversations(tenantId, keepConversationIds);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const chats = mapBackendConversationsToStore(rows, tenantId);
    const filtered = filterHydratedChats(chats, keepConversationIds);
    if (filtered.conversations.length === 0) return null;
    return filtered;
  } catch {
    return null;
  }
}

/** Merge overlay chats under existing store rows (store wins on id). */
export function mergeOverlayChats(
  conversations: Conversation[],
  messages: Message[],
  overlay: HydratedChats | null
): HydratedChats {
  if (!overlay) return { conversations, messages };
  const haveConv = new Set(conversations.map((row) => row.id));
  const haveMsg = new Set(messages.map((row) => row.id));
  return {
    conversations: [
      ...conversations,
      ...overlay.conversations.filter((row) => !haveConv.has(row.id)),
    ],
    messages: [
      ...messages,
      ...overlay.messages.filter((row) => !haveMsg.has(row.id)),
    ],
  };
}

export type HydrateStoreOptions = {
  /** Read-only shadow comparison of all persisted conversations, without display filters. */
  shadowFullSnapshot?: boolean;
  /**
   * Await `POST /v1/predictions`. Default true.
   * Homepage GET / passes false so TTFB is not blocked; Insights/Eval
   * dual-write after the response. GET /signals still attaches ids.
   */
  syncPredictions?: boolean;
  /**
   * Replace landing (`replaced=1`): keep only chats written with this
   * filename. Older weeks stay on a normal hydrate so a mid-week upsert
   * does not drop them. Day-1 (`weekly_export_count === 1`) does this
   * even without the flag. Bundled showcase ids are always removed first
   * when the pilot file is a live upload.
   */
  freshOnly?: boolean;
};

/**
 * Weekly uploads PUT the filename before chats land. Rows last written
 * before that pilot timestamp are the previous pack (Sample / Partner Demo).
 * `apply: false` means no live-partner filter — keep every row.
 */
export function filterConversationsForLivePartner<
  T extends { updated_at?: string },
>(
  rows: T[],
  pilot: {
    last_uploaded_file_name?: string | null;
    updated_at?: string | null;
  } | null,
): { apply: boolean; rows: T[] } {
  const name = pilot?.last_uploaded_file_name?.trim();
  if (!pilot || !isLivePartnerKeepSet(name)) return { apply: false, rows };
  const cutoff = pilot.updated_at ? Date.parse(pilot.updated_at) : NaN;
  if (!Number.isFinite(cutoff)) return { apply: true, rows: [] };
  return {
    apply: true,
    rows: rows.filter((row) => {
      const ms = row.updated_at ? Date.parse(row.updated_at) : NaN;
      return Number.isFinite(ms) && ms >= cutoff;
    }),
  };
}

/**
 * Neon already names a weekly upload, but its chats are not written yet.
 * In-memory only — persisting this would skip the next hydrate, and seeding
 * Sample would PUT Groww over the upload.
 */
export async function pendingLivePartnerStore(): Promise<StoreData | null> {
  const tenantId = currentStoreTenant();
  try {
    const remote = await getPilotSettings(tenantId);
    const name = remote?.last_uploaded_file_name?.trim();
    if (!remote || !isLivePartnerKeepSet(name)) return null;
    const store = structuredClone(emptyShowcaseStore);
    store.tenant.id = tenantId;
    store.pilot = pilotSettingsFromRemote(remote);
    return store;
  } catch {
    return null;
  }
}

/**
 * Build a JSON store from Neon chats, re-detect, optionally dual-write
 * predictions, persist. Returns null when Neon has no rows, is unreachable,
 * or a weekly filename is set and those chats are not written yet.
 */
export async function tryHydrateStoreFromNeon(
  options?: HydrateStoreOptions
): Promise<StoreData | null> {
  const tenantId = currentStoreTenant();
  const canonical = getStateMode() === "postgres";
  let remotePilot: Awaited<ReturnType<typeof getPilotSettings>> = null;
  try {
    remotePilot = await getPilotSettings(tenantId);
  } catch {
    if (canonical) throw new Error("Canonical pilot read unavailable; retry the request.");
    remotePilot = null;
  }
  let memberships: Awaited<ReturnType<typeof getActiveUploads>> = [];
  try {
    memberships = await getActiveUploads(tenantId);
  } catch {
    if (canonical) throw new Error("Canonical upload read unavailable; retry the request.");
    // Legacy deployments can still hydrate; durable-corpus failures must not
    // publish a reconstruction selected by an editable pilot timestamp.
    return null;
  }
  const durable = !options?.shadowFullSnapshot && Array.isArray(memberships) && memberships.length > 0;
  const memberIds = new Set(memberships.flatMap((entry) => entry.conversation_ids));
  let rows: BackendConversation[] = [];
  const liveName = remotePilot?.last_uploaded_file_name?.trim() ?? "";
  const cutoffMs = remotePilot?.updated_at
    ? Date.parse(remotePilot.updated_at)
    : NaN;
  const dayOneReplace = remotePilot?.weekly_export_count === 1;
  const freshOnlyFetch = Boolean(
    !options?.shadowFullSnapshot && !durable && isLivePartnerKeepSet(liveName) &&
      Number.isFinite(cutoffMs) &&
      remotePilot?.updated_at &&
      (options?.freshOnly || dayOneReplace),
  );
  let fetched: BackendConversation[];
  try {
    fetched = durable
      ? await fetchScopedConversations(tenantId, [...memberIds], { timeoutMs: HYDRATE_CONVERSATIONS_TIMEOUT_MS })
      : await getConversations(tenantId, {
      timeoutMs: HYDRATE_CONVERSATIONS_TIMEOUT_MS,
      ...(durable ? { conversationIds: [...memberIds] } : {}),
      ...(freshOnlyFetch && remotePilot?.updated_at
        ? { updatedSince: remotePilot.updated_at }
        : {}),
    });
  } catch {
    if (canonical) throw new Error("Canonical conversation read unavailable; retry the request.");
    return null;
  }
  if (!Array.isArray(fetched)) {
    if (!canonical) return null;
    throw new Error("Canonical conversation integrity failure: invalid response.");
  }
  rows = fetched;
  if (canonical && rows.some((row) => row.tenant_id !== tenantId)) {
    throw new Error("Canonical conversation integrity failure: cross-tenant row.");
  }
  if (
    canonical &&
    rows.some((row) =>
      row.messages.some(
        (message) =>
          message.tenant_id !== tenantId ||
          message.conversation_id !== row.conversation_id,
      ),
    )
  ) {
    throw new Error("Canonical conversation integrity failure: message ownership mismatch.");
  }
  if (
    canonical &&
    rows.some((row) =>
      row.messages.some(
        (message) => !STORE_ROLES.has(message.role as Message["role"]),
      ),
    )
  ) {
    throw new Error("Canonical conversation integrity failure: invalid message role.");
  }
  // Drop Sample / Partner Demo before this hydrate is written and painted.
  // A replace that seeded testing.json leaves those ids in Neon beside the file.
  if (!options?.shadowFullSnapshot && !durable && isLivePartnerKeepSet(remotePilot?.last_uploaded_file_name)) {
    const showcaseIds = await bundledShowcaseConversationIds();
    if (showcaseIds.size > 0) {
      rows = rows.filter((row) => !showcaseIds.has(row.conversation_id));
    }
  }
  if (canonical && durable && [...memberIds].some(id => !rows.some(row => row.conversation_id === id))) {
    throw new Error("Canonical conversation integrity failure: upload membership hole.");
  }
  let remoteResume: Awaited<ReturnType<typeof getDetectionResume>> = null;
  if (canonical) {
    try {
      remoteResume = await getDetectionResume(tenantId);
    } catch {
      throw new Error("Canonical detection resume read unavailable; retry the request.");
    }
  }
  const resumeState = {
    ...(canonical ? { detectionResumeUpdatedAt: remoteResume?.updated_at ?? "1970-01-01T00:00:00Z" } : {}),
    ...(remoteResume?.failed_conversation_ids?.length
      ? { llmFailedConversationIds: remoteResume.failed_conversation_ids }
      : {}),
    ...(remoteResume?.skipped_conversation_ids?.length
      ? { llmSkippedConversationIds: remoteResume.skipped_conversation_ids }
      : {}),
  };
  const emptyKeepSet = (): StoreData => ({
    tenant: {
      id: tenantId,
      name: tenantId === DEMO_TENANT_ID ? "Demo" : tenantId,
      createdAt: new Date().toISOString(),
    },
    conversations: [],
    messages: [],
    signals: [],
    taxonomyOverrides: {},
    ...(remotePilot ? { pilot: pilotSettingsFromRemote(remotePilot) } : {}),
    ...resumeState,
  });
  if (rows.length === 0) {
    // An empty corpus is still a canonical tenant. The fetched pilot has to
    // survive that read; the showcase shell baseline must not replace it.
    if (!canonical) return null;
    return emptyKeepSet();
  }
  const filtered = durable
    ? { apply: false, rows: rows.filter((row) => memberIds.has(row.conversation_id)) }
    : options?.shadowFullSnapshot
      ? { apply: false, rows }
      : filterConversationsForLivePartner(rows, remotePilot);
  // Filename is already the weekly upload, but Neon still has the previous pack.
  if (filtered.apply && filtered.rows.length === 0) {
    if (!canonical) return null;
    return emptyKeepSet();
  }
  const sourceRows = durable ? filtered.rows :
    filtered.apply && (options?.freshOnly || dayOneReplace)
      ? filtered.rows
      : rows;
  if (sourceRows.length === 0) {
    if (!canonical) return null;
    return emptyKeepSet();
  }
  const chats = mapBackendConversationsToStore(sourceRows, tenantId);
  if (filtered.apply && remotePilot?.last_uploaded_file_name) {
    const freshIds = new Set(
      filtered.rows.map((row) => row.conversation_id),
    );
    const fileName = remotePilot.last_uploaded_file_name;
    chats.conversations = chats.conversations.map((conversation) =>
      freshIds.has(conversation.id)
        ? { ...conversation, sourceFile: conversation.sourceFile ?? fileName }
        : conversation,
    );
  }
  if (durable) {
    const sourceById = new Map<string, string>();
    for (const entry of memberships) for (const id of entry.conversation_ids) sourceById.set(id, entry.upload.source);
    chats.conversations = chats.conversations.map((chat) => ({ ...chat, sourceFile: sourceById.get(chat.id) }));
  }
  if (chats.conversations.length === 0) {
    if (!canonical) return null;
    throw new Error(
      "Canonical conversation integrity failure: mapped conversations missing; retry the request.",
    );
  }

  // Reviewer phrases already stored for this tenant (Neon Adapt).
  const taxonomyOverrides =
    (await taxonomyOverridesFromNeon(tenantId)) ??
    emptyShowcaseStore.taxonomyOverrides ??
    {};

  let signals: Signal[] = [];
  let llmSkippedConversationIds: string[] | undefined;
  const testSleep = process.env.VITEST
    ? { sleep: async () => undefined }
    : undefined;
  const awaitPredictions = options?.syncPredictions !== false;

  try {
    if (durable || canonical) {
      // Hydration restores stored predictions; it never runs classification.
      const restored = await fetchTenantSignals(tenantId, { conversationIds: chats.conversations.map(chat => chat.id) });
      if (!restored.ok) throw new Error(restored.error);
      const persisted = restored.rows;
      const chatIds = new Set(chats.conversations.map(chat => chat.id));
      signals = persisted.filter((row) => chatIds.has(row.conversation_id))
        .map(predictionToStubSignal).filter((signal): signal is Signal => signal !== null);
      signals = applyNeonFeedbackToSignals(signals, persisted);
    } else {
    const detected = await runHybridDetectionWithLedger(
      chats.conversations,
      chats.messages,
      tenantId,
      taxonomyOverrides
    );
    signals = detected.signals;
    if (detected.llm.enabled) {
      llmSkippedConversationIds = detected.llm.skippedIds ?? [];
    }
    if (awaitPredictions) {
      const synced = await syncPredictionsToBackend(
        signals,
        tenantId,
        testSleep
      );
      signals = synced.signals;
    }
    try {
      const restored = await fetchTenantSignals(tenantId, { conversationIds: chats.conversations.map((chat) => chat.id) });
      if (!restored.ok) throw new Error(restored.error);
      const rows = restored.rows;
      if (Array.isArray(rows) && rows.length > 0) {
        signals = applyNeonFeedbackToSignals(signals, rows);
      }
    } catch {
      // Fail-soft: chats + signals still persist; chips stay Pending.
    }
    }
    signals = applyConversationGroundTruthToSignals(
      signals,
      chats.conversations
    );
  } catch {
    if (canonical) throw new Error("Canonical prediction read unavailable; retry the request.");
    if (durable) return null;
    // Keep chats (+ any signals assigned before the throw). Do not seed testing.json.
  }

  const store: StoreData = {
    ...structuredClone(emptyShowcaseStore),
    // Same tenant the chats were loaded for. Showcase shell id is tenant_demo.
    tenant: {
      id: tenantId,
      name:
        tenantId === DEMO_TENANT_ID
          ? emptyShowcaseStore.tenant.name
          : tenantId,
      createdAt: emptyShowcaseStore.tenant.createdAt,
    },
    conversations: chats.conversations,
    messages: chats.messages,
    signals,
    taxonomyOverrides,
    ...(llmSkippedConversationIds
      ? { llmSkippedConversationIds }
      : {}),
    ...resumeState,
  };

  if (remotePilot) {
    store.pilot = pilotSettingsFromRemote(remotePilot);
  } else if (canonical) {
    delete store.pilot;
  }

  if (canonical) {
    // Shadow parity compares signals/feedback/outcomes, not generated drafts.
    // Avoid emitting action/signal identifiers for the unfiltered corpus.
    if (!options?.shadowFullSnapshot) ensureSupervisedActions(store);
    await overlaySupervisedActionsFromNeon(
      store,
      store.conversations.map((conversation) => conversation.id),
    );
  }

  if (!canonical) await writeStore(store);
  return store;
}
