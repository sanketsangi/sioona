/** Strict, bounded MIME body selection. PostalMime owns RFC 5322 header decoding. */
export function emailBody(raw: string): { text?: string; html?: string } {
  let parts = 0;
  function parse(part: string, depth: number): { text?: string; html?: string } {
    if (++parts > 128 || depth > 16) throw new Error("MIME part limit");
    const separator = /\r?\n\r?\n/.exec(part);
    if (!separator || separator.index > 64 * 1024) throw new Error("MIME headers");
    const header = part.slice(0, separator.index).replace(/\r?\n[ \t]+/g, " ");
    const body = part.slice(separator.index + separator[0].length);
    const headers = new Map<string, string>();
    for (const line of header.split(/\r?\n/)) {
      const match = /^([\w-]+):\s*(.*)$/.exec(line);
      if (!match) throw new Error("MIME header syntax");
      const key = match[1].toLowerCase();
      if (headers.has(key) && ["content-type", "content-transfer-encoding", "content-disposition", "from", "date", "message-id", "x-sioona-role"].includes(key)) throw new Error("Duplicate MIME header");
      headers.set(key, match[2]);
    }
    const type = headers.get("content-type") || "text/plain; charset=us-ascii";
    if (/^multipart\//i.test(type)) {
      const boundary = /\bboundary\s*=\s*(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(type);
      const value = boundary?.[1] || boundary?.[2];
      if (!value || value.length > 200) throw new Error("MIME boundary");
      const lines = body.split(/(?<=\n)/);
      const children: string[] = [];
      let current: string | undefined;
      let closed = false;
      for (const line of lines) {
        const marker = line.replace(/\r?\n$/, "").trimEnd();
        if (marker === `--${value}` || marker === `--${value}--`) {
          if (current !== undefined) children.push(current.replace(/\r?\n$/, ""));
          if (marker.endsWith("--")) { closed = true; break; }
          current = "";
        } else if (current !== undefined) current += line;
      }
      if (!closed || !children.length || children.length > 128) throw new Error("Unclosed MIME boundary");
      const results = children.map((child) => parse(child, depth + 1));
      return { text: results.find((r) => r.text !== undefined)?.text, html: results.find((r) => r.html !== undefined)?.html };
    }
    // Never open attached or inline forwarded messages, or attachments of any MIME type.
    if (/^attachment\b/i.test(headers.get("content-disposition") || "") || !/^text\/(plain|html)\b/i.test(type)) return {};
    const charset = /\bcharset\s*=\s*"?([^;"\s]+)/i.exec(type)?.[1]?.toLowerCase() || "us-ascii";
    if (!["utf-8", "utf8", "us-ascii", "ascii"].includes(charset)) throw new Error("Unsupported text charset");
    const encoding = (headers.get("content-transfer-encoding") || "7bit").toLowerCase();
    let bytes: Buffer;
    if (encoding === "base64") {
      const compact = body.replace(/\s/g, "");
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) throw new Error("Malformed base64");
      bytes = Buffer.from(compact, "base64");
    } else if (encoding === "quoted-printable") {
      if (/=(?![0-9a-f]{2}|\r?\n)/i.test(body)) throw new Error("Malformed quoted-printable");
      const unfolded = body.replace(/=\r?\n/g, "");
      const rawBytes: number[] = [];
      for (let i = 0; i < unfolded.length; i++) {
        if (unfolded[i] === "=") { rawBytes.push(parseInt(unfolded.slice(i + 1, i + 3), 16)); i += 2; }
        else {
          const cp = unfolded.codePointAt(i)!;
          rawBytes.push(...Buffer.from(String.fromCodePoint(cp)));
          if (cp > 0xffff) i++;
        }
      }
      bytes = Buffer.from(rawBytes);
    } else if (["7bit", "8bit", "binary"].includes(encoding)) bytes = Buffer.from(body);
    else throw new Error("Unsupported transfer encoding");
    if ((charset === "ascii" || charset === "us-ascii") && bytes.some((b) => b > 127)) throw new Error("Invalid ASCII text");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return /^text\/plain/i.test(type) ? { text: content } : { html: content };
  }
  return parse(raw, 0);
}
