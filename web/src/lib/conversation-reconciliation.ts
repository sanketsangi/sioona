/** D6 counts and content hashes. Reports never contain source text. */
import { createHash } from "node:crypto";
import { getConversations, type BackendConversationInput, type BackendConversation } from "./backend-client";
import { currentStoreTenant } from "./tenant-context";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const instant = (value: string) => {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error("Invalid reconciliation timestamp");
  return new Date(ms).toISOString();
};
function inventory(rows: (BackendConversationInput | BackendConversation)[]) {
  const conversations = new Map<string, string>();
  const messages = new Map<string, string>();
  for (const row of rows) {
    if (conversations.has(row.conversation_id)) throw new Error("Duplicate conversation identity");
    conversations.set(row.conversation_id, hash([row.channel, row.customer_name ?? null, instant(row.started_at), row.external_id ?? null, row.ground_truth ?? null]));
    for (const message of row.messages) {
      if (messages.has(message.message_id)) throw new Error("Duplicate message identity");
      messages.set(message.message_id, hash([row.conversation_id, message.role, message.content, instant(message.timestamp)]));
    }
  }
  return { conversations, messages };
}
function differences(source: Map<string, string>, target: Map<string, string>) {
  return {
    missing: [...source.keys()].filter(id => !target.has(id)).sort(),
    extra: [...target.keys()].filter(id => !source.has(id)).sort(),
    changed: [...source.keys()].filter(id => target.has(id) && source.get(id) !== target.get(id)).sort(),
  };
}
export function reconcileConversationData(source: BackendConversationInput[], target: (BackendConversationInput | BackendConversation)[]) {
  const a = inventory(source), b = inventory(target);
  const conversations = differences(a.conversations, b.conversations), messages = differences(a.messages, b.messages);
  const digest = (rows: ReturnType<typeof inventory>) => hash([
    [...rows.conversations].sort(([a], [b]) => a.localeCompare(b)),
    [...rows.messages].sort(([a], [b]) => a.localeCompare(b)),
  ]);
  return {
    equal: Object.values(conversations).every(v => !v.length) && Object.values(messages).every(v => !v.length),
    sourceCounts: { conversations: a.conversations.size, messages: a.messages.size },
    targetCounts: { conversations: b.conversations.size, messages: b.messages.size },
    sourceHash: digest(a), targetHash: digest(b),
    missingConversations: conversations.missing, extraConversations: conversations.extra, changedConversations: conversations.changed,
    missingMessages: messages.missing, extraMessages: messages.extra, changedMessages: messages.changed,
  };
}
export async function comparePersistedConversations(source: BackendConversationInput[]) {
  const tenantId = currentStoreTenant();
  const rows = await getConversations(tenantId);
  if (rows.some(row => row.tenant_id !== tenantId || row.messages.some(message => message.tenant_id !== tenantId || message.conversation_id !== row.conversation_id))) {
    throw new Error("Conversation reconciliation tenant/ownership mismatch");
  }
  return reconcileConversationData(source, rows);
}

/** Compare operator-visible selections separately from persisted source hashes. */
export function compareConversationViews(source: import("./types").StoreData, target: import("./types").StoreData) {
  const project = (store: import("./types").StoreData, channel?: string, groundTruth?: string) => store.conversations
    .filter(chat => (!channel || chat.channel === channel) && (!groundTruth || chat.groundTruth === groundTruth))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || a.id.localeCompare(b.id))
    .map(chat => chat.id);
  const mismatches: string[] = [];
  const check = (name: string, a: unknown, b: unknown) => { if (hash(a) !== hash(b)) mismatches.push(name); };
  check("keep-set", project(source), project(target));
  for (const channel of new Set([...source.conversations, ...target.conversations].map(chat => chat.channel))) check(`channel:${channel}`, project(source, channel), project(target, channel));
  for (const label of ["lead", "retention", "upsell", "none"]) check(`ground-truth:${label}`, project(source, undefined, label), project(target, undefined, label));
  const a = project(source), b = project(target);
  for (let offset = 0; offset < Math.max(a.length, b.length); offset += 50) check(`page:${offset / 50}`, a.slice(offset, offset + 50), b.slice(offset, offset + 50));
  const outcomes = (store: import("./types").StoreData) => store.signals.map(signal => [signal.conversationId, signal.type, signal.status, signal.feedback ? [signal.feedback.label, signal.feedback.note ?? null, instant(signal.feedback.reviewedAt)] : null, signal.outcome ?? null])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  check("feedback-and-outcomes", outcomes(source), outcomes(target));
  const counts = (store: import("./types").StoreData) => ({ conversations: store.conversations.length, signals: store.signals.length, feedback: store.signals.filter(signal => signal.feedback).length });
  return { equal: mismatches.length === 0, mismatches, sourceCounts: counts(source), targetCounts: counts(target), sourceOutcomeHash: hash(outcomes(source)), targetOutcomeHash: hash(outcomes(target)) };
}
