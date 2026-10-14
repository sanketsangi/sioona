import { ServerResponse } from "node:http";
import { varyWithAccept } from "@/lib/vary-accept";

function headerValue(value: unknown): string | number | readonly string[] | undefined {
  if (typeof value === "string" || typeof value === "number" || Array.isArray(value)) return value;
  return undefined;
}

const patched = Symbol.for("sioona.vary-accept");
if (!Object.hasOwn(ServerResponse.prototype, patched)) {
  Object.defineProperty(ServerResponse.prototype, patched, { value: true });

  const originalSetHeader = ServerResponse.prototype.setHeader;
  ServerResponse.prototype.setHeader = function setHeaderWithAccept(name, value) {
    if (String(name).toLowerCase() === "vary") {
      return originalSetHeader.call(this, "Vary", varyWithAccept(headerValue(value)));
    }
    return originalSetHeader.call(this, name, value);
  };

  const originalAppendHeader = ServerResponse.prototype.appendHeader;
  ServerResponse.prototype.appendHeader = function appendHeaderWithAccept(name, value) {
    if (String(name).toLowerCase() !== "vary") return originalAppendHeader.call(this, name, value);
    const current = headerValue(this.getHeader("vary"));
    const added = headerValue(value);
    const text = [current, added]
      .flatMap((part) => (Array.isArray(part) ? part : part == null || part === "" ? [] : [part]))
      .join(", ");
    return originalSetHeader.call(this, "Vary", varyWithAccept(text));
  };

  const originalWriteHead = ServerResponse.prototype.writeHead;
  ServerResponse.prototype.writeHead = function writeHeadWithAccept(
    this: InstanceType<typeof ServerResponse>,
    ...args: Parameters<typeof originalWriteHead>
  ) {
    if (!this.headersSent) {
      const headers = args.at(-1);
      if (headers && typeof headers === "object" && !Array.isArray(headers)) {
        const key = Object.keys(headers).find((name) => name.toLowerCase() === "vary");
        const next = varyWithAccept(headerValue(key ? headers[key] : this.getHeader("vary")));
        if (key) headers[key] = next;
        else headers.Vary = next;
      } else {
        this.setHeader("Vary", varyWithAccept(this.getHeader("vary")));
      }
    }
    return originalWriteHead.apply(this, args);
  } as typeof originalWriteHead;
}
