import { EXPORT_LIMITS } from "./ingest-archive";

/** Bound the multipart envelope too: File.size checks happen after formData allocates. */
export async function readIngestForm(request: Request): Promise<FormData> {
  const limit = EXPORT_LIMITS.fileBytes + 1024 * 1024;
  const error = () => new Error("Upload exceeds the 11 MiB multipart limit. Nothing was imported.");
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > limit) throw error();
  if (!request.body) throw new Error("Upload body is required");
  const reader = request.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw error(); }
      chunks.push(new Uint8Array(value).buffer);
    }
  } finally { reader.releaseLock(); }
  return new Response(new Blob(chunks), { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
}
