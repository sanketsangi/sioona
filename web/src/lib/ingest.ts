import { randomUUID } from "crypto";
import {
  looksLikeIntercomJson,
  looksLikeWhatsappTxt,
  parseIntercomJson,
  parseWhatsappTxt,
  type IngestConversationInput,
  type IngestFormat,
} from "./ingest-platforms";
import { redactText } from "./redact";
import type { Conversation, Message, SignalType } from "./types";

export type {
  IngestFormat,
  IngestConversationInput,
  IngestMessageInput,
} from "./ingest-platforms";

export interface IngestResult {
  conversations: Conversation[];
  messages: Message[];
}

export interface IngestDocument {
  format: IngestFormat;
  conversations: IngestConversationInput[];
}

function parseCsv(text: string): IngestConversationInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => headers.indexOf(name);

  const required = ["conversation_id", "role", "content"];
  for (const key of required) {
    if (idx(key) === -1) {
      throw new Error(
        `CSV must include columns: conversation_id, role, content (optional: customer_name, channel, timestamp, ground_truth). For Intercom use JSON export; for WhatsApp use .txt chat export.`
      );
    }
  }

  const groups = new Map<string, IngestConversationInput>();

  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const conversationId = cols[idx("conversation_id")]?.trim();
    const roleRaw = cols[idx("role")]?.trim().toLowerCase();
    const content = cols[idx("content")]?.trim();
    if (!conversationId || !roleRaw || !content) continue;

    const role =
      roleRaw === "agent" || roleRaw === "system" ? roleRaw : "customer";

    if (!groups.has(conversationId)) {
      groups.set(conversationId, {
        externalId: conversationId,
        channel:
          idx("channel") >= 0 ? cols[idx("channel")] || "upload" : "upload",
        customerName:
          idx("customer_name") >= 0
            ? cols[idx("customer_name")] || undefined
            : undefined,
        startedAt:
          idx("timestamp") >= 0
            ? cols[idx("timestamp")] || new Date().toISOString()
            : new Date().toISOString(),
        groundTruth:
          idx("ground_truth") >= 0
            ? normalizeGroundTruth(cols[idx("ground_truth")])
            : undefined,
        messages: [],
      });
    }

    const group = groups.get(conversationId)!;
    group.messages.push({
      role,
      content,
      timestamp:
        idx("timestamp") >= 0
          ? cols[idx("timestamp")] || new Date().toISOString()
          : new Date().toISOString(),
    });
  }

  return [...groups.values()];
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current);
  return result;
}

function normalizeGroundTruth(
  value?: string
): SignalType | "none" | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "lead" || v === "retention" || v === "upsell" || v === "none") {
    return v;
  }
  return undefined;
}

/** Shown when import succeeds but detection finds nothing. */
export const ZERO_SIGNAL_HINT =
  "No lead/retention/upsell matches. Detection looks for support phrases (open account, switch, upgrade)—forum-style posts often score zero. Try Run Partner Demo or a real support export.";

function asTrimmedString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeMessageRole(
  value: unknown
): "customer" | "agent" | "system" {
  const raw = asTrimmedString(value).toLowerCase();
  if (
    raw === "agent" ||
    raw === "admin" ||
    raw === "support" ||
    raw === "bot" ||
    raw === "assistant"
  ) {
    return "agent";
  }
  if (raw === "system") return "system";
  return "customer";
}

function normalizeMessage(raw: unknown): IngestConversationInput["messages"][number] | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as Record<string, unknown>;
  const content = asTrimmedString(msg.content ?? msg.text ?? msg.body);
  if (!content) return null;
  return {
    role: normalizeMessageRole(msg.role ?? msg.sender ?? msg.author),
    content,
    timestamp: asTrimmedString(msg.timestamp) || undefined,
  };
}

function normalizeSioonaConversation(
  raw: unknown
): IngestConversationInput | null {
  if (!raw || typeof raw !== "object") return null;
  const conv = raw as Record<string, unknown>;
  const messagesRaw = Array.isArray(conv.messages) ? conv.messages : [];
  const messages = messagesRaw
    .map(normalizeMessage)
    .filter((m): m is NonNullable<typeof m> => m !== null);
  if (messages.length === 0) return null;

  const externalId =
    asTrimmedString(conv.externalId) || asTrimmedString(conv.id) || undefined;

  return {
    externalId,
    channel: asTrimmedString(conv.channel) || undefined,
    customerName: asTrimmedString(conv.customerName) || undefined,
    startedAt: asTrimmedString(conv.startedAt) || undefined,
    groundTruth: normalizeGroundTruth(asTrimmedString(conv.groundTruth)),
    messages,
  };
}

function parseSioonaJson(text: string): IngestConversationInput[] {
  const parsed = JSON.parse(text) as unknown;
  let rawList: unknown[];

  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { conversations?: unknown }).conversations)
  ) {
    rawList = (parsed as { conversations: unknown[] }).conversations;
  } else {
    throw new Error(
      "JSON must be an array of conversations or { conversations: [...] }"
    );
  }

  const conversations = rawList
    .map(normalizeSioonaConversation)
    .filter((c): c is IngestConversationInput => c !== null);

  if (conversations.length === 0) {
    throw new Error(
      "No usable conversations found. Each item needs messages with role + content (content/text/body). id is accepted as externalId."
    );
  }

  return conversations;
}

function parseJsonDocument(text: string): IngestDocument {
  const parsed = JSON.parse(text) as unknown;
  if (looksLikeIntercomJson(parsed)) {
    return { format: "intercom_json", conversations: parseIntercomJson(text) };
  }
  return { format: "sioona_json", conversations: parseSioonaJson(text) };
}

export function parseIngestDocument(
  filename: string,
  content: string
): IngestDocument {
  const lower = filename.toLowerCase();
  const trimmed = content.trim();

  if (lower.endsWith(".txt") || looksLikeWhatsappTxt(trimmed)) {
    return {
      format: "whatsapp_txt",
      conversations: parseWhatsappTxt(content, filename),
    };
  }

  if (lower.endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJsonDocument(content);
  }

  if (lower.endsWith(".csv")) {
    return { format: "sioona_csv", conversations: parseCsv(content) };
  }

  // Sniff remaining text
  if (looksLikeWhatsappTxt(trimmed)) {
    return {
      format: "whatsapp_txt",
      conversations: parseWhatsappTxt(content, filename),
    };
  }
  return { format: "sioona_csv", conversations: parseCsv(content) };
}

export function parseIngestFile(
  filename: string,
  content: string
): IngestConversationInput[] {
  return parseIngestDocument(filename, content).conversations;
}

export type ToStoreRecordsOptions = {
  /**
   * Derive conversation ids from externalId / CSV conversation_id
   * (`priya_sharma_22` → `conv_priya_sharma_22`). Partner Demo / reset and
   * partner file ingest pass `true` so re-uploads and Neon predictions join
   * the same conversation.id. Eval loaders omit it and keep random `conv_*`
   * ids (measurement only, no store write).
   */
  stableIds?: boolean;
};

/** Slug used when `stableIds` is on — `priya_sharma_22` → `conv_priya_sharma_22`. */
export function stableConversationId(
  externalId: string | undefined,
  used: Set<string>
): string {
  const slug = (externalId ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  const base = slug ? `conv_${slug}` : `conv_${randomUUID().slice(0, 8)}`;
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

export function toStoreRecords(
  inputs: IngestConversationInput[],
  tenantId: string,
  options?: ToStoreRecordsOptions
): IngestResult {
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  const usedIds = new Set<string>();

  for (const input of inputs) {
    if (!input.messages?.length) continue;
    const conversationId = options?.stableIds
      ? stableConversationId(input.externalId, usedIds)
      : `conv_${randomUUID().slice(0, 8)}`;
    const messageIds: string[] = [];
    const startedAt =
      input.startedAt ||
      input.messages[0]?.timestamp ||
      new Date().toISOString();

    for (const [index, msg] of input.messages.entries()) {
      const id = `msg_${conversationId}_${index}`;
      messageIds.push(id);
      messages.push({
        id,
        conversationId,
        role: msg.role,
        // PII redaction on the ingest path, before anything is stored.
        content: redactText(msg.content),
        timestamp: msg.timestamp || startedAt,
      });
    }

    conversations.push({
      id: conversationId,
      tenantId,
      externalId: input.externalId,
      channel: input.channel || "upload",
      customerName: input.customerName,
      startedAt,
      messageIds,
      groundTruth: input.groundTruth,
    });
  }

  return { conversations, messages };
}
