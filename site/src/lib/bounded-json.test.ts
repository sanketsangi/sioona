import { describe, expect, it } from "vitest";
import { readBoundedJson, RequestTooLarge } from "./bounded-json";

describe("bounded JSON stream", () => {
  it("cancels the stream before reading an oversized remainder", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(17)); },
      cancel() { cancelled = true; },
    });
    const request = new Request("http://localhost", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readBoundedJson(request, 16)).rejects.toBeInstanceOf(RequestTooLarge);
    expect(cancelled).toBe(true);
  });
  it("counts UTF-8 bytes rather than characters", async () => {
    const request = new Request("http://localhost", { method: "POST", body: JSON.stringify("हिन्दी") });
    await expect(readBoundedJson(request, 10)).rejects.toBeInstanceOf(RequestTooLarge);
  });
  it("accepts a valid body exactly at the byte limit", async () => {
    const request = new Request("http://localhost", { method: "POST", body: "{}" });
    expect(await readBoundedJson(request, 2)).toEqual({});
  });
});

it("preserves JSON split across empty and one-byte chunks", async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    for (let i = 0; i < 1000; i++) controller.enqueue(new Uint8Array());
    controller.enqueue(new Uint8Array([123]));
    controller.enqueue(new Uint8Array());
    controller.enqueue(new Uint8Array([125]));
    controller.close();
  } });
  const request = new Request("http://localhost", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  expect(await readBoundedJson(request, 2)).toEqual({});
});
