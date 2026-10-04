export class RequestTooLarge extends Error {}

/** One bounded buffer; chunk metadata cannot grow beyond the byte limit. */
export async function readBoundedJson(request: Request, maxBytes = 16384): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  const body = new Uint8Array(maxBytes);
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (bytes + value.byteLength > maxBytes) {
        await reader.cancel();
        throw new RequestTooLarge("Request is too large");
      }
      body.set(value, bytes);
      bytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.subarray(0, bytes)));
}
