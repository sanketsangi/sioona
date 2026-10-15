/** Verify exact provider bytes before parsing or resolving installation authority. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readWebhookBytes } from "../bounded-webhook-json";
import { isTenantId } from "../auth-token";
import { parseIntercomJson } from "../ingest-platforms";
import { toStoreRecords } from "../ingest";
import { toConversationSyncPayload } from "../sync-conversations";
import type { BackendConversationInput } from "../backend-client";

export type IntercomEventInput = {
  installation_id: string; workspace_id: string; event_id: string;
  source_id: string; provider_object_id: string | null; source_version: number;
  occurred_at: string; payload_sha256: string; kind: "upsert" | "delete" | "unresolved";
  conversation: BackendConversationInput | null;
};
export class IntercomVerificationError extends Error {
  constructor(readonly status = 401) { super("invalid_intercom_event"); }
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function id(value: unknown, max = 128): string {
  if (typeof value !== "string" || !new RegExp(`^[A-Za-z0-9_-]{1,${max}}$`).test(value)) throw new IntercomVerificationError();
  return value;
}
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

export async function verifyIntercomEvent(request: Request, now = Math.floor(Date.now() / 1000)) {
  if (request.headers.has("x-sioona-tenant-id") || request.headers.has("x-tenant-id")) throw new IntercomVerificationError();
  const secret = process.env.INTERCOM_CLIENT_SECRET;
  if (!secret) throw new IntercomVerificationError(503);
  const signature = request.headers.get("x-hub-signature") ?? "";
  if (!/^sha1=[a-f0-9]{40}$/.test(signature)) throw new IntercomVerificationError();
  const bytes = await readWebhookBytes(request, 4 * 1024 * 1024);
  const expected = createHmac("sha1", secret).update(bytes).digest();
  if (!timingSafeEqual(Buffer.from(signature.slice(5), "hex"), expected)) throw new IntercomVerificationError();
  let envelope: Record<string, unknown>;
  try { envelope = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
  catch { throw new IntercomVerificationError(400); }
  const created = envelope.created_at;
  const configuredWindow = process.env.INTERCOM_REPLAY_WINDOW_SECONDS ?? "900";
  const window = Number(configuredWindow);
  if (!Number.isInteger(window) || window < 60 || window > 86400) throw new IntercomVerificationError(503);
  if (typeof created !== "number" || !Number.isInteger(created) || created <= 0 || created < now - window || created > now + 60) throw new IntercomVerificationError();
  const workspace = id(envelope.app_id);
  let registry: Record<string, unknown>;
  try { registry = record(JSON.parse(process.env.INTERCOM_INSTALLATIONS_JSON ?? "{}")); }
  catch { throw new IntercomVerificationError(503); }
  const binding = record(registry[workspace]);
  const tenantId = typeof binding.tenantId === "string" ? binding.tenantId : "";
  if (!isTenantId(tenantId) || tenantId === "tenant_demo") throw new IntercomVerificationError();
  const installationId = id(binding.installationId, 64);
  const item = record(record(envelope.data).item);
  const providerObjectId = typeof item.id === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(item.id) ? item.id : null;
  const sourceId = digest(JSON.stringify([installationId, providerObjectId ?? envelope.id]));
  const updated = item.updated_at;
  const version = typeof updated === "number" && Number.isInteger(updated) && updated > 0 && updated <= 2147483647 ? updated : created;
  let conversation: BackendConversationInput | null = null;
  let kind: IntercomEventInput["kind"] = "unresolved";
  const topic = String(envelope.topic ?? "");
  if (topic === "conversation.deleted" && providerObjectId) {
    kind = "delete";
  } else if (topic.startsWith("conversation.") && providerObjectId && typeof updated === "number") {
    // Only complete snapshots advance state. Partial deliveries remain recoverable.
    const parts = record(item.conversation_parts);
    const list = parts.conversation_parts;
    const complete = Array.isArray(list) && (parts.total_count === undefined || parts.total_count === list.length);
    if (complete && typeof record(item.source).body === "string") {
      try {
        const chats = parseIntercomJson(JSON.stringify({ conversations: [item] }));
        const records = toStoreRecords(chats.map(c => ({ ...c, externalId: `${installationId}:${c.externalId}` })), tenantId, { stableIds: true });
        conversation = toConversationSyncPayload(records.conversations, records.messages)[0] ?? null;
        if (conversation) {
          // Stable provider part identities survive edits/reordering in snapshots.
          const textParts = [record(item.source), ...list.map(record)].filter(p => typeof p.body === "string" && p.body.replace(/<[^>]*>/g, "").trim());
          conversation.messages = conversation.messages?.map((m, i) => ({ ...m,
            message_id: `msg_${digest(JSON.stringify([sourceId, textParts[i]?.id ?? (i === 0 ? "source" : [m.role, m.timestamp, m.content])]))}` }));
          kind = "upsert";
        }
      } catch { /* Keep the signed source reference for explicit recovery. */ }
    }
  }
  const event: IntercomEventInput = {
    installation_id: installationId, workspace_id: workspace, event_id: id(envelope.id),
    source_id: sourceId, provider_object_id: providerObjectId, source_version: version,
    occurred_at: new Date(created * 1000).toISOString(), payload_sha256: digest(bytes), kind, conversation,
  };
  return { tenantId, event };
}
