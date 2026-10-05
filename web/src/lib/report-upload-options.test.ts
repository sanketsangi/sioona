import { expect, it, vi } from "vitest";
vi.mock("./backend-client", () => ({ getActiveUploads: vi.fn() }));
import { getActiveUploads } from "./backend-client";
import { reportUploadOptions } from "./report-upload-options";
const row = { upload: { tenant_id: "a", upload_id: "u1", status: "completed", source: "weekly.csv", imported_at: "2026-10-01T12:00:00Z" }, conversation_ids: ["c1", "c1", "c2"] };
it("labels exact tenant memberships with locale-aware counts and UTC dates", async () => {
  vi.mocked(getActiveUploads).mockResolvedValue([row] as never);
  const options = await reportUploadOptions("a");
  expect(options[0].id).toBe("u1");
  expect(options[0].label).toContain("weekly.csv");
  expect(options[0].label).toContain("UTC · 2 chats");
  expect(getActiveUploads).toHaveBeenCalledWith("a");
});
it("rejects cross-tenant or malformed choices without returning a partial list", async () => {
  for (const bad of [{ ...row, upload: { ...row.upload, tenant_id: "b" } },
    { ...row, upload: { ...row.upload, imported_at: "bad" } }, { ...row, conversation_ids: [null] }]) {
    vi.mocked(getActiveUploads).mockResolvedValue([row, bad] as never);
    await expect(reportUploadOptions("a")).rejects.toThrow();
  }
});

it("distinguishes same-name imports with identical displayed dates and counts", async () => {
  vi.mocked(getActiveUploads).mockResolvedValue([row, { ...row, upload: { ...row.upload, upload_id: "u2" } }] as never);
  const options = await reportUploadOptions("a");
  expect(new Set(options.map((option) => option.label)).size).toBe(2);
  expect(options[0].label).toContain("import 1");
  expect(options[1].label).toContain("import 2");
  expect(options.map((option) => option.id)).toEqual(["u1", "u2"]);
});
