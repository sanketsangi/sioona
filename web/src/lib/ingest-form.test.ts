import { expect, it } from "vitest";
import { readIngestForm } from "./ingest-form";
import { EXPORT_LIMITS } from "./ingest-archive";
it("rejects a declared oversized envelope before consumption", async () => {
  await expect(readIngestForm(new Request("http://localhost", { method: "POST", body: "x", headers: { "content-length": String(EXPORT_LIMITS.fileBytes + 1024 * 1024 + 1) } }))).rejects.toThrow("11 MiB");
});
it("bounds chunked envelopes without trusting Content-Length", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
  const request = new Request("http://localhost", { method: "POST", body, duplex: "half" } as RequestInit);
  await expect(readIngestForm(request)).rejects.toThrow("11 MiB"); expect(cancelled).toBe(true);
});
it("preserves multipart fields and bytes", async () => {
  const form = new FormData(); form.append("preview", "true"); form.append("file", new File(["हिंदी ₹500"], "a.eml"));
  const result = await readIngestForm(new Request("http://localhost", { method: "POST", body: form }));
  expect(result.get("preview")).toBe("true"); expect(await (result.get("file") as File).text()).toBe("हिंदी ₹500");
});
