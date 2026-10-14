import { afterEach, expect, it, vi } from "vitest";
import { readActorClaims, actorUserId } from "./actor-assertion";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.doUnmock("next/headers"); vi.resetModules(); });
it("signed-in job enqueue and polling send verified actor assertions with auth off", async () => {
  vi.stubEnv("SIOONA_ACTOR_AUTH", "off"); vi.stubEnv("SIOONA_ACTOR_KEY", "test-actor-key-at-least-32-bytes!"); vi.stubEnv("AUTH_SECRET", "test-auth-secret");
  const { signSession } = await import("./auth-token");
  const token = await signSession({ email: "reviewer@partner.example", role: "reviewer", tenantId: "tenant_partner" });
  vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: token }) }) })); vi.resetModules();
  const { enqueueUploadJob, enqueueDetectJob, enqueueHistoricalDetectJob, getJobStatus } = await import("./backend-client");
  const fetch = vi.fn(async (_url, init) => {
    const assertion = init.headers["X-Sioona-Actor"];
    if (!assertion) return Response.json({ detail: "actor_required" }, { status: 401 });
    const claims = readActorClaims(assertion);
    expect(claims.sub).toBe(actorUserId("reviewer@partner.example")); expect(claims.tid).toBe("tenant_partner");
    return Response.json({ job_id: "job-1", status: "queued" });
  }); vi.stubGlobal("fetch", fetch);
  await expect(enqueueUploadJob("tenant_partner", "upload-1", { source: "week.csv", replace: false, conversations: [], files: [] })).resolves.toMatchObject({ job_id: "job-1" });
  await expect(enqueueDetectJob("tenant_partner", "request-1", ["c1"])).resolves.toMatchObject({ job_id: "job-1" });
  await expect(enqueueHistoricalDetectJob("tenant_partner", "history-1", ["c1", "c2"])).resolves.toMatchObject({ job_id: "job-1" });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/jobs/historical"), expect.objectContaining({ body: JSON.stringify({ request_id: "history-1", conversation_ids: ["c1", "c2"] }) }));
  await expect(getJobStatus("tenant_partner", "job-1")).resolves.toMatchObject({ status: "queued" });
  expect(fetch).toHaveBeenCalledTimes(4);
});
