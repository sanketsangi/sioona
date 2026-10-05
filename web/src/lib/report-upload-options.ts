import { getActiveUploads } from "./backend-client";

export type ReportUploadOption = { id: string; label: string };

/** Tenant-validated choices; an invalid response is unavailable, never a partial list. */
export async function reportUploadOptions(tenantId: string): Promise<ReportUploadOption[]> {
  const rows = await getActiveUploads(tenantId);
  if (!Array.isArray(rows)) throw new Error("Invalid upload list");
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  const numbers = new Intl.NumberFormat("en-IN");
  const options = rows.map(({ upload, conversation_ids }) => {
    if (upload.tenant_id !== tenantId || upload.status !== "completed" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(upload.upload_id) || typeof upload.source !== "string" ||
        !Array.isArray(conversation_ids) || conversation_ids.some((id) => typeof id !== "string" || !id)) {
      throw new Error("Invalid upload choice");
    }
    const imported = new Date(upload.imported_at);
    if (!Number.isFinite(imported.getTime())) throw new Error("Invalid upload import time");
    const count = new Set(conversation_ids).size;
    return { id: upload.upload_id,
      label: `${upload.source || "Upload"} · ${date.format(imported)} UTC · ${numbers.format(count)} ${count === 1 ? "chat" : "chats"}` };
  });
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const row of options) totals.set(row.label, (totals.get(row.label) ?? 0) + 1);
  return options.map((row) => {
    if (totals.get(row.label) === 1) return row;
    const ordinal = (seen.get(row.label) ?? 0) + 1;
    seen.set(row.label, ordinal);
    return { ...row, label: `${row.label} · import ${numbers.format(ordinal)}` };
  });
}
