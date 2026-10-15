export class WebhookBodyTooLarge extends Error {}

/** Bound unredacted provider data before JSON parsing. */
export async function readWebhookBytes(request: Pick<Request, "body">, maxBytes = 32 * 1024 * 1024): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing webhook body");
  let buffer = new Uint8Array(Math.min(65536, maxBytes));
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (bytes + value.byteLength > maxBytes) {
        await reader.cancel();
        throw new WebhookBodyTooLarge();
      }
      if (bytes + value.byteLength > buffer.length) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(buffer.length * 2, bytes + value.byteLength)));
        grown.set(buffer.subarray(0, bytes));
        buffer = grown;
      }
      buffer.set(value, bytes);
      bytes += value.byteLength;
    }
  } finally { reader.releaseLock(); }
  return buffer.slice(0, bytes);
}

export async function readWebhookJson(request: Pick<Request, "body">, maxBytes = 32 * 1024 * 1024): Promise<unknown> {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readWebhookBytes(request, maxBytes)));
}
