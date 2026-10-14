import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
vi.mock("@/lib/auth-guard", () => ({ requireApiSession: vi.fn() }));
vi.mock("@/lib/backend-client", () => ({ getJobStatus: vi.fn() }));
import { requireApiSession } from "@/lib/auth-guard";
import { getJobStatus } from "@/lib/backend-client";
import { GET } from "./route";
const request = new Request("http://localhost/api/jobs/j1");
const context = (jobId = "j1") => ({ params: Promise.resolve({ jobId }) });
beforeEach(() => {
  vi.mocked(requireApiSession).mockResolvedValue({ tenantId: "tenant_a", role: "reviewer", name: "Reviewer", email: "a@example.test" });
});
afterEach(() => { vi.resetAllMocks(); });
it("polls only the tenant resolved from the authenticated session", async () => {
  const job = { job_id: "j1", upload_id: "u1", status: "succeeded" as const, attempt_count: 1, max_attempts: 3, completed_conversations: 1, conversation_count: 1, last_error_category: null };
  vi.mocked(getJobStatus).mockResolvedValue(job);
  const response = await GET(request, context());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(job);
  expect(getJobStatus).toHaveBeenCalledWith("tenant_a", "j1");
});
it("requires authentication before querying jobs", async () => {
  vi.mocked(requireApiSession).mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  expect((await GET(request, context())).status).toBe(401);
  expect(getJobStatus).not.toHaveBeenCalled();
});
it("rejects malformed references before querying jobs", async () => {
  expect((await GET(request, context("../other"))).status).toBe(400);
  expect(getJobStatus).not.toHaveBeenCalled();
});
it("returns a recoverable bounded error on backend failure", async () => {
  vi.mocked(getJobStatus).mockRejectedValue(new Error("private backend detail"));
  const response = await GET(request, context());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private");
});
