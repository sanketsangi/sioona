import JSZip from "jszip";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { parseIngestDocument, toStoreRecords } from "./ingest";
import { parseIngestUpload } from "./ingest-upload";
import { EXPORT_LIMITS, validateWorkbookArchive } from "./ingest-archive";
const time = "2026-10-13T12:00:00.000Z";
const body = "हिंदी mein SIP ₹5,000 रोकना है 😀 e\u0301";
const headers = ["conversation_id", "role", "content", "customer_name", "timestamp", "message_id"];
const row = ["thread-1", "customer", body, "Priya Sharma", time, "m1"];
async function workbook(sheets: unknown[][][] = [[headers, row]]) {
  const book = new ExcelJS.Workbook();
  sheets.forEach((rows, i) => book.addWorksheet(`Sheet${i}`).addRows(rows));
  return Buffer.from(await book.xlsx.writeBuffer());
}
const parseBook = async (sheets?: unknown[][][]) => parseIngestUpload("export.xlsx", await workbook(sheets));
function mail(options: { id?: string; refs?: string; content?: string; encoding?: string; type?: string; extra?: string; from?: string; date?: string } = {}) {
  return [`From: ${options.from ?? 'Priya Sharma <priya@example.test>'}`, `Message-ID: <${options.id ?? 'root'}@example.test>`, ...(options.refs ? [`References: ${options.refs}`] : []), ...(options.date === "" ? [] : [`Date: ${options.date ?? 'Tue, 13 Oct 2026 12:00:00 +0000'}`]), `Content-Type: ${options.type ?? 'text/plain; charset=utf-8'}`, `Content-Transfer-Encoding: ${options.encoding ?? '8bit'}`, ...(options.extra ? [options.extra] : []), "", options.content ?? body].join("\r\n");
}
const mailbox = (...emails: string[]) => emails.map((e) => `From sender@example.test Tue Oct 13 12:00:00 2026\n${e}\n`).join("");
const parseMail = (raw: string, ext = "eml") => parseIngestUpload(`export.${ext}`, Buffer.from(raw));
const store = (doc: Awaited<ReturnType<typeof parseIngestUpload>>) => toStoreRecords(doc.conversations, "tenant_test", { stableIds: true, provider: doc.format });
describe("CB-12 XLSX", () => {
  it("matches canonical JSON through toStoreRecords", async () => {
    const doc = await parseBook();
    const canonical = parseIngestDocument("c.json", JSON.stringify(doc.conversations));
    expect(toStoreRecords(canonical.conversations, "tenant_test", { stableIds: true, provider: doc.format })).toEqual(store(doc));
  });
  it("joins threads across sheets and deduplicates message IDs", async () => {
    const doc = await parseBook([[headers, row], [headers, row, ["thread-1", "agent", "Done", "Priya Sharma", time, "m2"], ["thread-2", "customer", "Other", "Asha Mehta", time, "m3"]]]);
    expect(doc.conversations).toHaveLength(2); expect(doc.conversations[0].messages).toHaveLength(2);
  });
  it("deduplicates identical rows without IDs", async () => {
    expect((await parseBook([[headers.slice(0, 5), row.slice(0, 5), row.slice(0, 5)]])).conversations[0].messages).toHaveLength(1);
  });
  it("preserves whitespace, Unicode, SHA256 and code-point offsets", async () => {
    const content = `  ${body}\r\nsecond line\t `;
    const records = store(await parseBook([[headers, [...row.slice(0, 2), content, ...row.slice(3)]]]));
    expect(records.messages[0].content).toBe(content);
    expect(createHash("sha256").update(records.messages[0].content).digest("hex")).toBe(createHash("sha256").update(content).digest("hex"));
    const points = Array.from(records.messages[0].content), start = points.indexOf("₹");
    expect(points.slice(start, start + 6).join("")).toBe("₹5,000");
  });
  it("redacts names and PII before persistence", async () => {
    const records = store(await parseBook([[headers, [...row.slice(0, 2), "Priya Sharma mail priya@example.test ₹5,000", ...row.slice(3)]]]));
    expect(records.conversations[0].customerName).toMatch(/^Customer [a-f0-9]{8}$/);
    expect(records.messages[0].content).toBe("[name] mail [email] ₹5,000");
  });
  it("replays deterministic tenant-scoped IDs", async () => {
    const doc = await parseBook(); expect(store(doc)).toEqual(store(await parseBook()));
    expect(store(doc).conversations[0].id).not.toBe(toStoreRecords(doc.conversations, "other", { stableIds: true, provider: doc.format }).conversations[0].id);
  });
  it("reads cached formula values without evaluation", async () => {
    expect((await parseBook([[headers, [...row.slice(0, 2), { formula: 'HYPERLINK("https://invalid.test", "SIP")', result: body }, ...row.slice(3)]]])).conversations[0].messages[0].content).toBe(body);
  });
  it("reads rich text values", async () => {
    expect((await parseBook([[headers, [...row.slice(0, 2), { richText: [{ text: "₹" }, { text: "500" }] }, ...row.slice(3)]]])).conversations[0].messages[0].content).toBe("₹500");
  });
  it("uses UTC sentinel for absent timestamps", async () => {
    expect((await parseBook([[headers, [...row.slice(0, 4), "", "m1"]]])).conversations[0].startedAt).toBe("1970-01-01T00:00:00.000Z");
  });
  it("normalizes explicit offsets to UTC", async () => {
    expect((await parseBook([[headers, [...row.slice(0, 4), "2026-10-13T17:30:00+05:30", "m1"]]])).conversations[0].startedAt).toBe(time);
  });
  it.each([
    ["missing column", [["conversation_id", "content"], ["a", "text"]]],
    ["empty message", [headers, [...row.slice(0, 2), " ", ...row.slice(3)]]],
    ["invalid role", [headers, ["thread-1", "owner", ...row.slice(2)]]],
    ["missing ID", [headers, ["", ...row.slice(1)]]],
    ["local timestamp", [headers, [...row.slice(0, 4), "2026-10-13T12:00:00", "m1"]]],
    ["bad timestamp", [headers, [...row.slice(0, 4), "nonsenseZ", "m1"]]],
    ["uncached formula", [headers, [...row.slice(0, 2), { formula: "1+1" }, ...row.slice(3)]]],
    ["conflicting message ID", [headers, row, [...row.slice(0, 2), "changed", ...row.slice(3)]]],
    ["conflicting customer", [headers, row, [...row.slice(0, 3), "Asha Mehta", time, "m2"]]],
    ["oversized message", [headers, [...row.slice(0, 2), "x".repeat(EXPORT_LIMITS.messageChars + 1), ...row.slice(3)]]],
    ["duplicate header", [[...headers, "content"], row]],
  ])("rejects %s atomically", async (_, rows) => { await expect(parseBook([rows as unknown[][]])).rejects.toThrow("Nothing was imported"); });
  it("rejects malformed ZIP", async () => { await expect(parseIngestUpload("a.xlsx", Buffer.from("not ZIP"))).rejects.toThrow("archive"); });
  it.each(["crc", "expanded size"])("rejects corrupted %s", async (kind) => {
    const bytes = await workbook(), central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    if (kind === "crc") bytes[central + 16] ^= 1; else bytes.writeUInt32LE(EXPORT_LIMITS.expandedBytes + 1, central + 24);
    expect(() => validateWorkbookArchive(bytes)).toThrow("archive");
  });
  it("rejects sparse row expansion", async () => {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet("Sparse");
    sheet.addRow(headers); sheet.getCell("A10002").value = "huge";
    await expect(parseIngestUpload("a.xlsx", Buffer.from(await book.xlsx.writeBuffer()))).rejects.toThrow("archive");
  });
  it("rejects excess sheets", async () => { await expect(parseBook(Array.from({ length: EXPORT_LIMITS.sheets + 1 }, () => [headers, row]))).rejects.toThrow("archive"); });
});
describe("CB-12 email", () => {
  it("preserves Hindi/Hinglish/INR through redaction", async () => {
    const doc = await parseMail(mail({ content: body + " Priya Sharma" }));
    expect(store(doc).messages[0].content).toContain(body + " [name]");
    expect(store(doc).conversations[0].customerName).toMatch(/^Customer [a-f0-9]{8}$/);
  });
  it("decodes quoted-printable UTF-8 and soft breaks", async () => {
    const qp = [...Buffer.from(body)].map((b) => `=${b.toString(16).padStart(2, "0")}`).join("");
    expect((await parseMail(mail({ encoding: "quoted-printable", content: qp.slice(0, 12) + "=\r\n" + qp.slice(12) }))).conversations[0].messages[0].content).toBe(body);
  });
  it("decodes base64 UTF-8", async () => { expect((await parseMail(mail({ encoding: "base64", content: Buffer.from(body).toString("base64") }))).conversations[0].messages[0].content).toBe(body); });
  it("joins multi-thread mbox in any order and deduplicates IDs", async () => {
    const root = mail(), reply = mail({ id: "reply", refs: "<root@example.test>", content: "Done", extra: "X-Sioona-Role: agent" }), other = mail({ id: "other", content: "Other thread" });
    const a = await parseMail(mailbox(reply, root, root, other), "mbox"), b = await parseMail(mailbox(other, root, reply), "mbox");
    expect(a.conversations).toHaveLength(2);
    expect(a.conversations.find((c) => c.externalId === "<root@example.test>")!.messages).toHaveLength(2);
    expect(store(a)).toEqual(store(b));
  });
  it("uses In-Reply-To when References is absent", async () => { expect((await parseMail(mailbox(mail(), mail({ id: "reply", extra: "In-Reply-To: <root@example.test>" })), "mbox")).conversations).toHaveLength(1); });
  it("scrubs all customer participants", async () => {
    const doc = await parseMail(mailbox(mail(), mail({ id: "reply", refs: "<root@example.test>", from: "Asha Mehta <asha@example.test>", content: "Asha Mehta Priya Sharma" })), "mbox");
    expect(store(doc).messages.some((m) => m.content.includes("[name] [name]"))).toBe(true);
  });
  it("converts HTML without scripts, links or fetches", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const doc = await parseMail(mail({ type: "text/html; charset=utf-8", content: '<p>₹500 हिंदी</p><script>evil()</script><img src="https://invalid.test"><a href="https://invalid.test">SIP</a>' }));
    expect(doc.conversations[0].messages[0].content).toContain("₹500 हिंदी");
    expect(doc.conversations[0].messages[0].content).not.toMatch(/evil|https:/);
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
  it("ignores attachments", async () => {
    const doc = await parseMail(mail({ type: 'multipart/mixed; boundary="b"', content: '--b\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' + body + '\r\n--b\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="evil.js"\r\n\r\nevil()\r\n--b--' }));
    expect(doc.conversations[0].messages[0].content).toContain(body); expect(doc.conversations[0].messages[0].content).not.toContain("evil");
  });
  it("unescapes mboxrd From lines", async () => { expect((await parseMail(mailbox(mail({ content: "Hi\n>From sender\n>>From nested" })), "mbox")).conversations[0].messages[0].content).toContain("\nFrom sender\n>From nested"); });
  it("uses stable fallback without Message-ID and Date", async () => {
    const raw = mail({ date: "" }).replace(/^Message-ID:.*\r\n/m, ""), doc = await parseMail(raw);
    expect(store(doc)).toEqual(store(await parseMail(raw))); expect(doc.conversations[0].startedAt).toBe("1970-01-01T00:00:00.000Z");
  });
  it.each([
    ["headers", "plain text", "eml"], ["empty body", mail({ content: " " }), "eml"], ["bad date", mail({ date: "not a date" }), "eml"], ["invalid role", mail({ extra: "X-Sioona-Role: owner" }), "eml"], ["mbox separator", mail(), "mbox"], ["conflicting duplicate", mailbox(mail(), mail({ content: "different" })), "mbox"],
  ])("rejects %s atomically", async (_, raw, ext) => { await expect(parseMail(raw, ext)).rejects.toThrow("Nothing was imported"); });
});
describe("upload boundary and baseline", () => {
  it("rejects oversized files", async () => { await expect(parseIngestUpload("large.xlsx", Buffer.alloc(EXPORT_LIMITS.fileBytes + 1))).rejects.toThrow("10 MiB"); });
  it.each(["eml", "mbox", "json", "csv"])("rejects invalid UTF-8 %s", async (ext) => { await expect(parseIngestUpload(`bad.${ext}`, Buffer.from([0xff, 0xfe]))).rejects.toThrow("UTF-8"); });
  it.each(["csv", "json", "txt", "intercom.json"])("preserves canonical %s behavior", async (ext) => {
    const content = ext === "csv" ? 'conversation_id,role,content\na,customer,Hello' : ext === "json" ? JSON.stringify([{ externalId: "a", messages: [{ role: "customer", content: "Hello" }] }]) : ext === "intercom.json" ? JSON.stringify([{ id: "a", source: { type: "conversation", body: "<p>Hello</p>", author: { type: "user", name: "Priya Sharma" } } }]) : '[13/10/2026, 12:00] Priya Sharma: Hello\n[13/10/2026, 12:01] You: Hi';
    vi.useFakeTimers(); vi.setSystemTime(new Date(time));
    expect(await parseIngestUpload(`a.${ext}`, Buffer.from(content))).toEqual(parseIngestDocument(`a.${ext}`, content)); vi.useRealTimers();
  });
});

describe("additional adversarial exports", () => {
  it.each([
    ["bad quoted printable", mail({ encoding: "quoted-printable", content: "=ZZ" })],
    ["bad base64", mail({ encoding: "base64", content: "@@@@" })],
    ["bad decoded UTF8", mail({ encoding: "base64", content: "/w==" })],
    ["unsupported charset", mail({ type: "text/plain; charset=windows-1252" })],
    ["unclosed multipart", mail({ type: 'multipart/mixed; boundary="b"', content: '--b\r\nContent-Type: text/plain\r\n\r\nHi' })],
    ["ambiguous header", mail({ extra: "Message-ID: <duplicate@example.test>" })],
    ["local email date", mail({ date: "2026-10-13T12:00:00" })],
  ])("rejects %s", async (_, raw) => { await expect(parseMail(raw)).rejects.toThrow("Nothing was imported"); });
  it("preserves EML whitespace and CRLF exactly after MIME decoding", async () => {
    const content = `  ${body}\r\nsecond line\t `;
    expect((await parseMail(mail({ content }))).conversations[0].messages[0].content).toBe(content);
  });
  it("preserves decoded email SHA256 and code-point quote reconstruction", async () => {
    const qp = [...Buffer.from(body)].map((b) => `=${b.toString(16).padStart(2, "0")}`).join("");
    const records = store(await parseMail(mail({ encoding: "quoted-printable", content: qp })));
    expect(createHash("sha256").update(records.messages[0].content).digest("hex")).toBe(createHash("sha256").update(body).digest("hex"));
    const points = Array.from(records.messages[0].content), start = points.indexOf("₹");
    expect(points.slice(start, start + 6).join("")).toBe("₹5,000");
  });
  it("email matches the canonical conversation contract", async () => {
    const doc = await parseMail(mail());
    expect(store(doc)).toEqual(toStoreRecords(doc.conversations, "tenant_test", { stableIds: true, provider: "email" }));
  });
  it("short customer names redact whole Unicode words", async () => {
    const doc = await parseBook([[headers, ["t", "customer", "Li asks about limits ₹500", "Li", time, "m"]]]);
    expect(store(doc).messages[0].content).toBe("[name] asks about limits ₹500");
  });
  it("new-format demo identities never persist raw names in IDs", async () => {
    const doc = await parseBook([[headers, ["Priya Sharma", "customer", body, "Priya Sharma", time, "m"]]]);
    const records = toStoreRecords(doc.conversations, "tenant_demo", { stableIds: true, provider: doc.format });
    expect(JSON.stringify(records)).not.toMatch(/priya|sharma/i);
  });
  it("rejects aggregate row overflow across sheets", async () => {
    const r = ["t", "customer", "Hi", "Priya Sharma", time, "m"];
    await expect(parseBook([[headers, ...Array.from({ length: 5001 }, () => r)], [headers, ...Array.from({ length: 5000 }, () => r)]])).rejects.toThrow("Too many rows");
  });
  it("rejects empty workbooks", async () => { await expect(parseBook([[headers]])).rejects.toThrow("No messages"); });
});

describe("archive allocation adversaries", () => {
  it("rejects entity-encoded single-quoted sparse row coordinates", async () => {
    const zip = await JSZip.loadAsync(await workbook());
    const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    zip.file("xl/worksheets/sheet1.xml", xml.replace('r="2"', "r='&#49;00002'"));
    await expect(parseIngestUpload("a.xlsx", await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow("archive");
  });
  it("rejects malformed worksheet XML before allocation", async () => {
    const zip = await JSZip.loadAsync(await workbook());
    zip.file("xl/worksheets/sheet1.xml", "<worksheet><row></worksheet>");
    await expect(parseIngestUpload("a.xlsx", await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow("archive");
  });
  it("rejects macro-bearing workbooks", async () => {
    const zip = await JSZip.loadAsync(await workbook()); zip.file("xl/vbaProject.bin", "never execute");
    await expect(parseIngestUpload("a.xlsx", await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow("archive");
  });
  it("rejects invalid XML byte encoding", async () => {
    const zip = await JSZip.loadAsync(await workbook()); zip.file("xl/sharedStrings.xml", Buffer.from([0xff, 0xfe]));
    await expect(parseIngestUpload("a.xlsx", await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow("archive");
  });
  it("rejects oversized expansion regardless of compressed file size", async () => {
    const zip = await JSZip.loadAsync(await workbook()); zip.file("huge.bin", Buffer.alloc(EXPORT_LIMITS.expandedBytes + 1));
    const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(bytes.length).toBeLessThan(EXPORT_LIMITS.fileBytes);
    await expect(parseIngestUpload("a.xlsx", bytes)).rejects.toThrow("archive");
  });
});


describe("review regressions", () => {
  it.each([
    '<cols><col min="1" max="1000" width="10"/></cols>',
    "<cols><col min='1' max='&#49;000' width='10'/></cols>",
    '<mergeCells count="1"><mergeCell ref="A1:AG2"/></mergeCells>',
    '<mergeCells count="1"><mergeCell ref="A1:B10002"/></mergeCells>',
    '<cols><col min="1000" max="1000"/></cols>',
    '<cols><col min="0" max="2"/></cols>',
    '<cols><col min="2" max="1"/></cols>',
    "<mergeCells><mergeCell ref='A1:B&#49;0002'/></mergeCells>",
    '<mergeCells count="1"><mergeCell ref="A1:AF100"/></mergeCells>',
    '<mergeCells count="200"><mergeCell ref="A1:B2"/></mergeCells>',
    '<dataValidations count="1"><dataValidation sqref="A1:XFD1048576"/></dataValidations>',
    "<dataValidations><dataValidation sqref='A1:B&#49;0002'/></dataValidations>",
    '<dataValidations><dataValidation sqref="A1:AF100"/></dataValidations>',
    '<dataValidations count="100"><dataValidation sqref="A1"/></dataValidations>',
  ])("rejects allocation-driving ranges before ExcelJS: %s", async (range) => {
    const zip = await JSZip.loadAsync(await workbook());
    const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    zip.file("xl/worksheets/sheet1.xml", xml.replace('</worksheet>', range + '</worksheet>'));
    const bytes = await zip.generateAsync({ type: "nodebuffer" });
    expect(() => validateWorkbookArchive(bytes)).toThrow("archive");
  });
  it("preserves bounded data validation without densification", async () => {
    const zip = await JSZip.loadAsync(await workbook());
    const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    zip.file("xl/worksheets/sheet1.xml", xml.replace('</worksheet>', '<dataValidations count="1"><dataValidation sqref="B2:B10" type="list"/></dataValidations></worksheet>'));
    const bytes = await zip.generateAsync({ type: "nodebuffer" });
    expect(() => validateWorkbookArchive(bytes)).not.toThrow();
    const doc = await parseIngestUpload("a.xlsx", bytes);
    expect(doc.conversations[0].messages[0].content).toBe(body);
  });
  it.each(["xl/prefix/xl/worksheets/sheet1.xml", "xl/worksheets/sheet1.xml.extra"])("rejects ExcelJS worksheet path aliases: %s", async (path) => {
    const zip = await JSZip.loadAsync(await workbook());
    const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    zip.remove("xl/worksheets/sheet1.xml");
    zip.file(path, xml.replace('</worksheet>', '<cols><col min="1" max="1000"/></cols></worksheet>'));
    const relationships = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    zip.file("xl/_rels/workbook.xml.rels", relationships.replace('worksheets/sheet1.xml', path.slice(3)));
    const bytes = await zip.generateAsync({ type: "nodebuffer" });
    expect(() => validateWorkbookArchive(bytes)).toThrow("archive");
  });
  it("preserves bounded column styles and merges", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Sheet0");
    sheet.addRows([headers, row]);
    sheet.getColumn(EXPORT_LIMITS.columns).width = 10;
    sheet.mergeCells("A3:B4");
    const bytes = await book.xlsx.writeBuffer();
    expect(() => validateWorkbookArchive(Buffer.from(bytes))).not.toThrow();
    const doc = await parseBook();
    expect(doc.conversations[0].messages[0].content).toBe(body);
  });
  it("ignores multipart attachment before the real body", async () => {
    const content = [
      '--outer', 'Content-Type: multipart/alternative; boundary="inner"',
      'Content-Disposition: attachment; filename="attached.mime"', '',
      '--inner', 'Content-Type: text/plain; charset=utf-8', '', 'ATTACHMENT SECRET',
      '--inner--', '--outer', 'Content-Type: text/plain; charset=utf-8', '',
      'ACTUAL BODY', '--outer--',
    ].join('\r\n');
    const doc = await parseMail(mail({ type: 'multipart/mixed; boundary="outer"', content }));
    expect(doc.conversations[0].messages[0].content).toBe('ACTUAL BODY');
  });
});
