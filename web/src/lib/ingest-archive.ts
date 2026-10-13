import { SaxesParser } from "saxes";
import { inflateRawSync } from "node:zlib";

export const EXPORT_LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  expandedBytes: 40 * 1024 * 1024,
  entries: 256,
  sheets: 32,
  rows: 10_000,
  columns: 32,
  messageChars: 100_000,
} as const;

function boundedCell(reference: unknown): [number, number] {
  const match = typeof reference === "string" && /^([A-Z]+)(\d+)$/.exec(reference);
  if (!match) throw new Error();
  let column = 0;
  for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (column > EXPORT_LIMITS.columns || row < 1 || row > EXPORT_LIMITS.rows + 1) throw new Error();
  return [column, row];
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate the entire ZIP before the workbook reader can allocate from it. No extraction. */
export function validateWorkbookArchive(bytes: Buffer): void {
  try {
    if (bytes.length > EXPORT_LIMITS.fileBytes) throw new Error();
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
    if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error();
    const count = bytes.readUInt16LE(end + 10);
    const size = bytes.readUInt32LE(end + 12);
    const start = bytes.readUInt32LE(end + 16);
    if (!count || count > EXPORT_LIMITS.entries || bytes.readUInt16LE(end + 8) !== count || start + size !== end || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) throw new Error();
    let cursor = start;
    let expanded = 0;
    const names = new Set<string>();
    const ranges: [number, number][] = [];
    for (let entry = 0; entry < count; entry++) {
      if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error();
      const flags = bytes.readUInt16LE(cursor + 8);
      const method = bytes.readUInt16LE(cursor + 10);
      const crc = bytes.readUInt32LE(cursor + 16);
      const compressed = bytes.readUInt32LE(cursor + 20);
      const original = bytes.readUInt32LE(cursor + 24);
      const nameLength = bytes.readUInt16LE(cursor + 28);
      const extraLength = bytes.readUInt16LE(cursor + 30);
      const commentLength = bytes.readUInt16LE(cursor + 32);
      const local = bytes.readUInt32LE(cursor + 42);
      const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
      const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
      expanded += original;
      if (flags & 1 || ![0, 8].includes(method) || expanded > EXPORT_LIMITS.expandedBytes || names.has(name) || name.includes("..") || name.startsWith("/") || name.includes("\\") || name.includes("\0") || /vbaProject|externalLinks/i.test(name)) throw new Error();
      // ExcelJS matches worksheet paths without anchors; reject aliases before XML/load.
      if (/xl\/worksheets\/sheet\d+[.]xml/.test(name) && !/^xl\/worksheets\/sheet\d+[.]xml$/.test(name)) throw new Error();
      names.add(name);
      if (bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 26) !== nameLength) throw new Error();
      if (!bytes.subarray(local + 30, local + 30 + nameLength).equals(nameBytes)) throw new Error();
      // JSZip honors Unicode-path and ZIP64 extras; reject those alternate identities/sizes.
      for (const [offset, length] of [[cursor + 46 + nameLength, extraLength], [local + 30 + nameLength, bytes.readUInt16LE(local + 28)]]) {
        let extra = offset;
        while (extra < offset + length) {
          const kind = bytes.readUInt16LE(extra);
          if (kind === 0x7075 || kind === 0x0001) throw new Error();
          extra += 4 + bytes.readUInt16LE(extra + 2);
        }
        if (extra !== offset + length) throw new Error();
      }
      const dataStart = local + 30 + nameLength + bytes.readUInt16LE(local + 28);
      const dataEnd = dataStart + compressed;
      if (dataEnd > start || ranges.some(([a, b]) => local < b && dataEnd > a)) throw new Error();
      ranges.push([local, dataEnd]);
      const data = bytes.subarray(dataStart, dataEnd);
      const decoded = method === 0 ? data : inflateRawSync(data, { maxOutputLength: Math.max(1, original) });
      if (decoded.length !== original || crc32(decoded) !== crc) throw new Error();
      // Reject invalid XML encoding, DTDs and absurd sparse cell coordinates before ExcelJS allocates rows.
      if (name.endsWith(".xml")) {
        const xml = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
        const parser = new SaxesParser();
        let elements = 0;
        let depth = 0;
        parser.on("error", () => { throw new Error(); });
        parser.on("doctype", () => { throw new Error(); });
        parser.on("opentag", (tag) => {
          if (++elements > 200_000 || ++depth > 64) throw new Error();
          if (!/^xl\/worksheets\//.test(name)) return;
          const reference = tag.attributes.r;
          if (tag.name === "row" && (typeof reference !== "string" || !/^\d+$/.test(reference) || Number(reference) > EXPORT_LIMITS.rows + 1)) throw new Error();
          if (tag.name === "c") boundedCell(reference);
          if (tag.name === "col") {
            const { min, max } = tag.attributes;
            if (typeof min !== "string" || typeof max !== "string" || !/^\d+$/.test(min) || !/^\d+$/.test(max) || Number(min) < 1 || Number(max) < Number(min) || Number(max) > EXPORT_LIMITS.columns) throw new Error();
          }
          if (tag.name === "mergeCell") {
            const ref = tag.attributes.ref;
            if (typeof ref !== "string") throw new Error();
            const endpoints = ref.split(":");
            if (endpoints.length !== 2) throw new Error();
            const [left, top] = boundedCell(endpoints[0]);
            const [right, bottom] = boundedCell(endpoints[1]);
            if (right < left || bottom < top) throw new Error();
          }
        });
        parser.on("closetag", () => { depth--; });
        parser.write(xml).close();
      }
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    if ([...names].filter((name) => /^xl\/worksheets\/sheet[^/]*\.xml$/.test(name)).length > EXPORT_LIMITS.sheets) throw new Error();
    if (cursor !== end || !names.has("xl/workbook.xml") || !names.has("[Content_Types].xml")) throw new Error();
  } catch {
    throw new Error("XLSX archive is corrupted, unsupported, or exceeds archive/row limits. Nothing was imported.");
  }
}
