import { parseIngestDocument, type IngestDocument } from "./ingest";
import { parseEmail, parseXlsx } from "./ingest-exports";
import { EXPORT_LIMITS } from "./ingest-archive";

/** Server-side byte boundary. Legacy text adapters retain their existing behavior. */
export async function parseIngestUpload(filename: string, data: Uint8Array): Promise<IngestDocument> {
  if (!data.byteLength || data.byteLength > EXPORT_LIMITS.fileBytes) throw new Error("Export must be nonempty and at most 10 MiB. Nothing was imported.");
  const bytes = Buffer.from(data);
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "xlsx") return { format: "sioona_xlsx", conversations: await parseXlsx(bytes) };
  if (extension === "eml" || extension === "mbox") return { format: "email", conversations: await parseEmail(bytes, extension === "mbox") };
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Export must use valid UTF-8. Nothing was imported."); }
  const document = parseIngestDocument(filename, text);
  const messages = document.conversations.flatMap((conversation) => conversation.messages);
  if (messages.length > EXPORT_LIMITS.rows || messages.some((m) => m.content.length > EXPORT_LIMITS.messageChars)) throw new Error("Export exceeds row or message limits. Nothing was imported.");
  return document;
}

export const EXPORT_MAPPING = {
  sioona_xlsx: "Each nonempty sheet: conversation_id → conversation, role/content → message; optional customer_name, channel, timestamp, message_id, ground_truth.",
  email: "Message-ID + References/In-Reply-To → thread; decoded plain text (HTML fallback) → content; From → customer; X-Sioona-Role → role (default customer).",
};
