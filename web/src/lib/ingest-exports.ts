import { createHash } from "node:crypto";
import { emailBody } from "./ingest-mime";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import PostalMime from "postal-mime";
import { convert } from "html-to-text";
import type { IngestConversationInput, IngestMessageInput } from "./ingest-platforms";
import { EXPORT_LIMITS, validateWorkbookArchive } from "./ingest-archive";

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const MISSING_TIME = "1970-01-01T00:00:00.000Z";
function fail(location: string, reason: string): never {
  // Locations contain only indices: never echo customer text, headers or sender identities.
  throw new Error(`${location}: ${reason}. Nothing was imported.`);
}
function timestamp(value: string | Date | undefined, location: string): string {
  if (!value) return MISSING_TIME;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) fail(location, "Invalid timestamp");
    return value.toISOString();
  }
  // Explicit timezone required. Do not depend on the server's locale/timezone.
  if (!/(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)\s*$/i.test(value) || !Number.isFinite(Date.parse(value))) fail(location, "Timestamp requires a valid explicit timezone");
  return new Date(value).toISOString();
}
function cellText(cell: ExcelJS.Cell, location: string): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "richText" in v) return v.richText.map((part) => part.text).join("");
  // Formulas are never evaluated; only an explicitly cached scalar result is accepted.
  if (typeof v === "object" && ("formula" in v || "sharedFormula" in v)) {
    if (typeof v.result === "string" || typeof v.result === "number") return String(v.result);
    fail(location, "Formula has no cached scalar value");
  }
  if (typeof v === "object" && "hyperlink" in v) return v.text;
  return fail(location, "Unsupported cell value");
}
function validateBody(content: string, location: string) {
  if (!content.trim()) fail(location, "Empty message");
  if (content.length > EXPORT_LIMITS.messageChars) fail(location, "Message exceeds size limit");
}

export async function parseXlsx(bytes: Buffer): Promise<IngestConversationInput[]> {
  validateWorkbookArchive(bytes);
  // XML parsers fold literal CRLF. Protect cell text CR as character references;
  // this is an in-memory rewrite of a fully validated archive, never extraction.
  const zip = await JSZip.loadAsync(bytes);
  let patched = false;
  for (const entry of Object.values(zip.files)) {
    if (!/^xl\/(sharedStrings|worksheets\/[^/]+)\.xml$/.test(entry.name)) continue;
    const xml = await entry.async("string");
    let preserved = xml.replace(/(<(t|v)(?:\s[^>]*)?>)([\s\S]*?)(<\/\2>)/g, (whole, open, _tag, text: string, close) => {
      if (!text.includes("\r")) return whole;
      const escaped = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_whole, value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
      return open + escaped.replace(/\r/g, "&#13;") + close;
    });
    if (/^xl\/worksheets\//.test(entry.name)) {
      preserved = preserved.replace(/<dataValidations\b[\s\S]*?<\/dataValidations>/gi, "").replace(/<dataValidation\b[^>]*\/>/gi, "");
    }
    if (preserved !== xml) { zip.file(entry.name, preserved); patched = true; }
  }
  const workbookBytes = patched ? await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) : bytes;
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(workbookBytes as unknown as Parameters<typeof workbook.xlsx.load>[0]); }
  catch { fail("Workbook", "Malformed XLSX"); }
  if (!workbook.worksheets.length || workbook.worksheets.length > EXPORT_LIMITS.sheets) fail("Workbook", "Invalid sheet count");
  const groups = new Map<string, IngestConversationInput>();
  const duplicates = new Map<string, Map<string, string>>();
  let rowCount = 0;
  let decodedTextBytes = 0;
  for (const [sheetIndex, sheet] of workbook.worksheets.entries()) {
    const location = `Sheet ${sheetIndex + 1}`;
    if (!sheet.actualRowCount) continue;
    if (sheet.columnCount > EXPORT_LIMITS.columns) fail(location, "Too many columns");
    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => headers.push(cellText(cell, location).trim().toLowerCase()));
    if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) fail(location, "Duplicate columns");
    for (const key of ["conversation_id", "role", "content"]) if (!headers.includes(key)) fail(location, `Missing ${key} column`);
    for (let n = 2; n <= sheet.rowCount; n++) {
      const row = sheet.getRow(n);
      if (!row.hasValues) continue;
      const at = `${location}, row ${n}`;
      if (++rowCount > EXPORT_LIMITS.rows) fail(at, "Too many rows");
      const get = (key: string) => headers.includes(key) ? cellText(row.getCell(headers.indexOf(key) + 1), at) : "";
      const externalId = get("conversation_id").trim();
      const role = get("role").trim().toLowerCase();
      const content = get("content");
      if (!externalId || !["customer", "agent", "system"].includes(role)) fail(at, "Missing conversation ID or invalid role");
      validateBody(content, at);
      decodedTextBytes += Buffer.byteLength(content, "utf8");
      if (decodedTextBytes > EXPORT_LIMITS.expandedBytes) fail(at, "Decoded cell text exceeds 40 MiB");
      const time = timestamp(get("timestamp"), at);
      const customerName = get("customer_name").trim() || undefined;
      const channel = get("channel").trim() || "upload";
      const gt = get("ground_truth").trim().toLowerCase();
      if (gt && !["lead", "retention", "upsell", "none"].includes(gt)) fail(at, "Invalid ground truth");
      if (!groups.has(externalId)) {
        groups.set(externalId, { externalId, customerName, channel, startedAt: time, groundTruth: (gt || undefined) as IngestConversationInput["groundTruth"], messages: [] });
        duplicates.set(externalId, new Map());
      }
      const group = groups.get(externalId)!;
      if (group.customerName !== customerName || group.channel !== channel || group.groundTruth !== (gt || undefined)) fail(at, "Conflicting conversation metadata");
      const message: IngestMessageInput = { role: role as IngestMessageInput["role"], content, timestamp: time };
      const signature = JSON.stringify(message);
      const key = get("message_id").trim() || signature;
      const seen = duplicates.get(externalId)!;
      if (seen.has(key)) {
        if (seen.get(key) !== signature) fail(at, "Conflicting duplicate message ID");
        continue;
      }
      seen.set(key, signature);
      group.messages.push(message);
    }
  }
  if (!groups.size) fail("Workbook", "No messages");
  return [...groups.values()];
}

function htmlText(html: string): string {
  return convert(html, { wordwrap: false, selectors: [
    { selector: "a", options: { ignoreHref: true } },
    { selector: "img", format: "skip" },
    { selector: "script", format: "skip" },
    { selector: "style", format: "skip" },
  ] });
}

/** RFC 5322 messages; mboxrd separators and From escaping, not arbitrary vendor JSON. */
export async function parseEmail(bytes: Buffer, mbox: boolean): Promise<IngestConversationInput[]> {
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return fail("Email", "Invalid UTF-8 export"); }
  let chunks = [raw];
  if (mbox) {
    if (!raw.startsWith("From ")) fail("Mailbox", "Missing mbox separator");
    chunks = raw.split(/^From [^\r\n]*\r?\n/gm).slice(1).map((chunk) => chunk.replace(/^>(>*From )/gm, "$1"));
  }
  if (!chunks.length || chunks.length > EXPORT_LIMITS.rows) fail("Mailbox", "Invalid message count");
  const emails: { id: string; refs: string[]; customerName?: string; message: IngestMessageInput }[] = [];
  const seen = new Map<string, string>();
  for (const [index, chunk] of chunks.entries()) {
    const at = `Email ${index + 1}`;
    if (!/^[\s\S]*?\r?\n\r?\n/.test(chunk) || !/^From:/im.test(chunk)) fail(at, "Missing email headers or body separator");
    let email;
    try { email = await PostalMime.parse(chunk, { maxNestingDepth: 16, maxPartCount: 128, maxHeadersSize: 64 * 1024, forceRfc822Attachments: true }); }
    catch { fail(at, "Malformed MIME message"); }
    // Attachments are parsed locally by MIME, never opened, executed or fetched.
    let decoded;
    try { decoded = emailBody(chunk); } catch { fail(at, "Malformed MIME body or unsupported encoding"); }
    const content = decoded.text ?? (decoded.html ? htmlText(decoded.html) : "");
    validateBody(content, at);
    const id = email.messageId || `sha256:${createHash("sha256").update(chunk).digest("hex")}`;
    const refs = (email.references || email.inReplyTo || "").match(/<[^<>\s]+>/g) || [];
    const customerName = email.from?.name || email.from?.address;
    if (!customerName) fail(at, "Missing sender");
    // Direction is explicit; From/To alone cannot identify the tenant's support mailbox.
    const direction = email.headers.find((h) => h.key === "x-sioona-role")?.value.toLowerCase() || "customer";
    if (!["customer", "agent", "system"].includes(direction)) fail(at, "Invalid X-Sioona-Role");
    const message: IngestMessageInput = { role: direction as IngestMessageInput["role"], content, timestamp: timestamp(email.headers.find((h) => h.key === "date")?.value.replace(/\s*\([^)]*\)\s*$/, ""), at) };
    const signature = JSON.stringify([customerName, refs, message]);
    if (seen.has(id)) {
      if (seen.get(id) !== signature) fail(at, "Conflicting duplicate Message-ID");
      continue;
    }
    seen.set(id, signature);
    emails.push({ id, refs, customerName, message });
  }
  // Union the reference graph, including absent ancestors. Order of export never splits a thread.
  const parents = new Map<string, string>();
  function root(id: string): string {
    let current = id;
    while (parents.has(current)) current = parents.get(current)!;
    return current;
  }
  for (const email of emails) {
    const ancestor = root(email.refs[0] || email.id);
    for (const id of [email.id, ...email.refs]) {
      const current = root(id);
      if (current !== ancestor) parents.set(current, ancestor);
    }
  }
  emails.sort((a, b) => compare(a.message.timestamp!, b.message.timestamp!) || compare(a.id, b.id));
  const groups = new Map<string, IngestConversationInput>();
  for (const email of emails) {
    const externalId = root(email.id);
    if (!groups.has(externalId)) groups.set(externalId, { externalId, channel: "email", customerNames: [], messages: [] });
    const group = groups.get(externalId)!;
    if (!group.customerName && email.message.role === "customer") group.customerName = email.customerName;
    if (email.message.role === "customer" && email.customerName && !group.customerNames!.includes(email.customerName)) group.customerNames!.push(email.customerName);
    group.messages.push(email.message);
  }
  for (const group of groups.values()) {
    group.messages.sort((a, b) => compare(a.timestamp!, b.timestamp!));
    group.startedAt = group.messages[0].timestamp;
  }
  return [...groups.values()];
}
