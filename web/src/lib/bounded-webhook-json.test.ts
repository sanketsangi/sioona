import { expect, it } from "vitest";
import { readWebhookJson, WebhookBodyTooLarge } from "./bounded-webhook-json";
it("preserves an exact byte boundary", async () => {
  expect(await readWebhookJson(new Request("http://localhost", { method: "POST", body: '{"x":1}' }), 7)).toEqual({ x: 1 });
});
it("cancels an oversized streamed payload", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8)); },
    cancel() { cancelled = true; } });
  const request = new Request("http://localhost", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await expect(readWebhookJson(request, 7)).rejects.toBeInstanceOf(WebhookBodyTooLarge);
  expect(cancelled).toBe(true);
});
it("rejects malformed UTF-8 without substituting customer text", async () => {
  const request = new Request("http://localhost", { method: "POST", body: new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125]) });
  await expect(readWebhookJson(request)).rejects.toThrow();
});
