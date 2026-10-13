import { ServerResponse } from "node:http";
import { varyWithAccept } from "@/lib/vary-accept";

function headerValue(value: unknown): string | number | readonly string[] | undefined {
  if (typeof value === "string" || typeof value === "number" || Array.isArray(value)) return value;
  return undefined;
}

const original = ServerResponse.prototype.writeHead;

ServerResponse.prototype.writeHead = function writeHeadWithAccept(
  this: InstanceType<typeof ServerResponse>,
  ...args: Parameters<typeof original>
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
  return original.apply(this, args);
} as typeof original;
