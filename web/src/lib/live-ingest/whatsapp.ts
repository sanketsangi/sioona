/**
 * Provider-agnostic WhatsApp inbound adapter.
 * First implementations: Gupshup and Interakt webhooks.
 * Inbound only — the parsed chats are stored, never answered.
 */

import type { IngestConversationInput } from "../ingest-platforms";

export type WhatsAppProvider = "gupshup" | "interakt";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Gupshup sends `timestamp` as unix seconds or milliseconds. */
function timestampOf(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  const text = textOf(value);
  if (text) return text;
  return new Date(0).toISOString();
}

export function parseGupshupWebhook(body: unknown): IngestConversationInput[] {
  const root = asRecord(body);
  const payload = asRecord(root?.payload) ?? root;
  if (!payload) return [];
  const inner = asRecord(payload.payload);
  const text =
    textOf(inner?.text) ||
    textOf(payload.text) ||
    textOf(asRecord(payload.message)?.text);
  if (!text) return [];
  const id = textOf(payload.id) || textOf(payload.source) || "gupshup";
  const name = textOf(asRecord(payload.sender)?.name) || undefined;
  const timestamp = timestampOf(payload.timestamp);
  return [
    {
      externalId: `gupshup:${id}`,
      channel: "whatsapp",
      customerName: name,
      startedAt: timestamp,
      messages: [{ role: "customer", content: text, timestamp }],
    },
  ];
}

export function parseInteraktWebhook(body: unknown): IngestConversationInput[] {
  const root = asRecord(body);
  const data = asRecord(root?.data) ?? root;
  if (!data) return [];
  const message = asRecord(data.message);
  const text = textOf(message?.message) || textOf(data.message);
  if (!text) return [];
  const customer = asRecord(data.customer);
  const id = textOf(customer?.id) || textOf(data.id) || "interakt";
  const name = textOf(customer?.name) || undefined;
  const timestamp = textOf(message?.received_at_utc) || new Date(0).toISOString();
  return [
    {
      externalId: `interakt:${id}`,
      channel: "whatsapp",
      customerName: name,
      startedAt: timestamp,
      messages: [{ role: "customer", content: text, timestamp }],
    },
  ];
}

export function parseWhatsAppWebhook(
  provider: string,
  body: unknown,
): IngestConversationInput[] {
  if (provider === "interakt") return parseInteraktWebhook(body);
  if (provider === "gupshup") return parseGupshupWebhook(body);
  return [];
}
