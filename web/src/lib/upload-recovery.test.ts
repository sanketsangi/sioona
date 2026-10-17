import { describe, expect, it, vi } from "vitest";
import { knownUploadJob, resumeUploadJob } from "./upload-recovery";

describe("known upload recovery", () => {
  it("resumes only an existing job with GET and never resubmits a file", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "running", completed_conversations: 2, conversation_count: 3 })));
    const job = knownUploadJob(new URLSearchParams("uploadJob=job_12&uploadFile=week.csv"));
    expect(job).toEqual({ id: "job_12", file: "week.csv" });
    expect(await resumeUploadJob(job!, new AbortController().signal, request)).toMatchObject({ status: "running", completed_conversations: 2 });
    expect(request).toHaveBeenCalledWith("/api/jobs/job_12", expect.objectContaining({ method: "GET" }));
  });
  it("rejects missing and malformed recovery metadata", () => {
    expect(knownUploadJob(new URLSearchParams("uploadJob=../other&uploadFile=week.csv"))).toBeNull();
    expect(knownUploadJob(new URLSearchParams("uploadJob=job_12"))).toBeNull();
  });
  it("keeps connection loss distinct from processing failure", async () => {
    await expect(resumeUploadJob({id:"job1",file:"week.csv"}, new AbortController().signal, vi.fn().mockResolvedValue(new Response("", {status:503})))).rejects.toThrow("Progress connection lost");
  });
});

it("uses indeterminate progress when the server has no reliable total", async () => {
  const { uploadJobProgress } = await import("./upload-recovery");
  expect(uploadJobProgress({status:"leased"})).toBe("Detection processing…");
  expect(uploadJobProgress({status:"leased",completed_conversations:2,conversation_count:5})).toContain("2 of 5");
});


it("retains a known job on network loss and offers polling recovery", async () => {
  await expect(resumeUploadJob({ id: "job1", file: "week.csv" }, new AbortController().signal,
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))))
    .rejects.toThrow("Progress connection lost");
});

it("rejects an unreadable status response instead of polling invented stages", async () => {
  for (const value of [{}, { status: "unknown" }, { status: "succeeded" }, { status: "running", completed_conversations: -1 }]) {
    await expect(resumeUploadJob({ id: "job1", file: "week.csv" }, new AbortController().signal,
      vi.fn().mockResolvedValue(new Response(JSON.stringify(value)))))
      .rejects.toThrow("Upload progress response was invalid");
  }
});

it("preserves abort semantics when polling stops on navigation", async () => {
  await expect(resumeUploadJob({ id: "job1", file: "week.csv" }, new AbortController().signal,
    vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"))))
    .rejects.toMatchObject({ name: "AbortError" });
});

it("preserves absent counts and accepts zero only when the completed job reports it", async () => {
  for (const count of [undefined, null, 0, 7]) {
    const response = { status: "succeeded", completed_conversations: 2, conversation_count: 2, signal_count: count };
    const result = await resumeUploadJob({ id: "job1", file: "week.csv" }, new AbortController().signal,
      vi.fn().mockResolvedValue(Response.json(response)));
    expect(result.signal_count).toBe(count);
  }
  await expect(resumeUploadJob({ id: "job1", file: "week.csv" }, new AbortController().signal,
    vi.fn().mockResolvedValue(Response.json({ status: "succeeded", completed_conversations: 2, conversation_count: 2, signal_count: -1 }))))
    .rejects.toThrow("Upload progress response was invalid");
});
