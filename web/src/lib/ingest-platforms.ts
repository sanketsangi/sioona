export type IngestFormat =
  | "sioona_csv"
  | "sioona_json"
  | "intercom_json"
  | "whatsapp_txt";

export interface IngestMessageInput {
  role: "customer" | "agent" | "system";
  content: string;
  timestamp?: string;
}

export interface IngestConversationInput {
  externalId?: string;
  channel?: string;
  customerName?: string;
  startedAt?: string;
  groundTruth?: "lead" | "retention" | "upsell" | "none";
  messages: IngestMessageInput[];
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function unixToIso(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return unixToIso(asNum);
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return undefined;
}

function intercomRole(
  authorType: string | undefined
): IngestMessageInput["role"] {
  const t = (authorType || "").toLowerCase();
  if (t === "admin" || t === "bot" || t === "team") return "agent";
  if (t === "system" || t === "assignment" || t === "note") return "system";
  return "customer";
}

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function intercomParts(conversation: LooseRecord): LooseRecord[] {
  const nested = asRecord(conversation.conversation_parts);
  if (nested && Array.isArray(nested.conversation_parts)) {
    return nested.conversation_parts.filter(
      (part): part is LooseRecord => !!asRecord(part)
    );
  }
  if (Array.isArray(conversation.conversation_parts)) {
    return conversation.conversation_parts.filter(
      (part): part is LooseRecord => !!asRecord(part)
    );
  }
  if (Array.isArray(conversation.parts)) {
    return conversation.parts.filter(
      (part): part is LooseRecord => !!asRecord(part)
    );
  }
  return [];
}

export function looksLikeIntercomJson(parsed: unknown): boolean {
  const list = Array.isArray(parsed)
    ? parsed
    : asRecord(parsed) && Array.isArray(asRecord(parsed)!.conversations)
      ? (asRecord(parsed)!.conversations as unknown[])
      : null;
  if (!list?.length) return false;
  const first = asRecord(list[0]);
  if (!first) return false;
  if (Array.isArray(first.messages)) return false;
  return Boolean(
    first.conversation_parts ||
      first.parts ||
      asRecord(first.source)?.type ||
      first.type === "conversation"
  );
}

export function parseIntercomJson(text: string): IngestConversationInput[] {
  const parsed = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : asRecord(parsed) && Array.isArray(asRecord(parsed)!.conversations)
      ? (asRecord(parsed)!.conversations as unknown[])
      : null;

  if (!list?.length) {
    throw new Error(
      "Intercom JSON must be an array of conversations or { conversations: [...] }"
    );
  }

  const results: IngestConversationInput[] = [];

  for (const item of list) {
    const conversation = asRecord(item);
    if (!conversation) continue;

    const messages: IngestMessageInput[] = [];
    const source = asRecord(conversation.source);
    const sourceBody =
      typeof source?.body === "string" ? stripHtml(source.body) : "";
    if (sourceBody) {
      const author = asRecord(source?.author);
      messages.push({
        role: intercomRole(
          typeof author?.type === "string" ? author.type : "user"
        ),
        content: sourceBody,
        timestamp: unixToIso(source?.created_at ?? conversation.created_at),
      });
    }

    for (const part of intercomParts(conversation)) {
      const partType =
        typeof part.part_type === "string" ? part.part_type.toLowerCase() : "";
      if (
        partType &&
        !["comment", "open", "close", "note"].includes(partType) &&
        partType !== "assignment"
      ) {
        // keep unknown text parts; skip pure attachments without body
      }
      const body = typeof part.body === "string" ? stripHtml(part.body) : "";
      if (!body) continue;
      const author = asRecord(part.author);
      const role =
        partType === "note" || partType === "assignment"
          ? "system"
          : intercomRole(
              typeof author?.type === "string" ? author.type : undefined
            );
      messages.push({
        role,
        content: body,
        timestamp: unixToIso(part.created_at ?? conversation.updated_at),
      });
    }

    if (!messages.length) continue;

    const customer =
      messages.find((m) => m.role === "customer") &&
      (() => {
        const author = asRecord(source?.author);
        if (author && author.type === "user" && typeof author.name === "string") {
          return author.name;
        }
        for (const part of intercomParts(conversation)) {
          const a = asRecord(part.author);
          if (a?.type === "user" && typeof a.name === "string") return a.name;
        }
        return undefined;
      })();

    results.push({
      externalId: String(conversation.id ?? conversation.conversation_id ?? ""),
      channel: "intercom",
      customerName: customer || undefined,
      startedAt:
        unixToIso(conversation.created_at) || messages[0]?.timestamp,
      messages,
    });
  }

  if (!results.length) {
    throw new Error("No Intercom conversations with message bodies found");
  }
  return results;
}

const WHATSAPP_LINE =
  /^\[?(\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]?\s*[-–]?\s*([^:]+):\s([\s\S]+)$/i;

/** DD/MM/YYYY (or DD.MM.YYYY) when V8 slash parsing rejects the stamp. */
function parseDayFirstWhatsappTimestamp(
  datePart: string,
  timePart: string,
): string | undefined {
  const dateMatch = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(
    datePart.trim(),
  );
  if (!dateMatch) return undefined;
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  let year = Number(dateMatch[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AP]M))?$/i.exec(
    timePart.trim(),
  );
  if (!timeMatch) return undefined;
  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = timeMatch[3] ? Number(timeMatch[3]) : 0;
  const meridiem = timeMatch[4]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined;

  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString();
}

function parseWhatsappTimestamp(datePart: string, timePart: string): string {
  const parsed = Date.parse(`${datePart} ${timePart}`);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  // V8 reads slash dates as MM/DD/YYYY, so 27/09/2026 is NaN. WhatsApp
  // exports from this pack are DD/MM/YYYY; do not stamp those with ingest time.
  return (
    parseDayFirstWhatsappTimestamp(datePart, timePart) ??
    new Date().toISOString()
  );
}

export function looksLikeWhatsappTxt(content: string): boolean {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return false;
  let hits = 0;
  for (const line of lines.slice(0, 12)) {
    if (WHATSAPP_LINE.test(line.trim())) hits += 1;
  }
  return hits >= 2;
}

/**
 * WhatsApp Business chat export (.txt).
 * "You" = agent/business; other named senders = customer.
 */
export function parseWhatsappTxt(
  content: string,
  filename?: string
): IngestConversationInput[] {
  const lines = content.split(/\r?\n/);
  const messages: IngestMessageInput[] = [];
  let customerName: string | undefined;
  let buffer: {
    role: IngestMessageInput["role"];
    content: string;
    timestamp: string;
    author: string;
  } | null = null;

  function flush() {
    if (!buffer?.content.trim()) {
      buffer = null;
      return;
    }
    if (
      /messages and calls are end-to-end encrypted/i.test(buffer.content) ||
      /this chat is with a business account/i.test(buffer.content)
    ) {
      buffer = null;
      return;
    }
    messages.push({
      role: buffer.role,
      content: buffer.content.trim(),
      timestamp: buffer.timestamp,
    });
    buffer = null;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const match = line.trim().match(WHATSAPP_LINE);
    if (match) {
      flush();
      const [, datePart, timePart, authorRaw, body] = match;
      const author = authorRaw.trim();
      const isAgent = /^you$/i.test(author);
      if (!isAgent && !customerName) customerName = author;
      buffer = {
        role: isAgent ? "agent" : "customer",
        content: body,
        timestamp: parseWhatsappTimestamp(datePart, timePart),
        author,
      };
      continue;
    }
    if (buffer) {
      buffer.content += `\n${line}`;
    }
  }
  flush();

  if (!messages.length) {
    throw new Error(
      "No WhatsApp messages found. Export a chat as .txt (with timestamps)."
    );
  }

  const externalId =
    filename?.replace(/\.[^.]+$/, "") ||
    `whatsapp_${customerName?.replace(/\s+/g, "_").toLowerCase() || "chat"}`;

  return [
    {
      externalId,
      channel: "whatsapp",
      customerName,
      startedAt: messages[0]?.timestamp,
      messages,
    },
  ];
}
