import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ index: 0, setters: [] as ReturnType<typeof vi.fn>[], push: vi.fn(), refresh: vi.fn(), fileName: "week.csv" }));
vi.mock("next/navigation", () => ({ useRouter: () => h }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const i = h.index++; const setter = vi.fn(); h.setters[i] = setter; return [i === 0 ? [new File(["x"], h.fileName)] : initial, setter]; },
  useRef: () => ({ current: null }), useEffect: () => {}, useCallback: (fn: unknown) => fn,
}));
import { UploadForm } from "./UploadForm";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); h.index = 0; h.fileName = "week.csv"; h.push.mockClear(); h.refresh.mockClear(); });
it.each(["succeeded", "dead_lettered", "cancelled"])("waits for publication and handles %s", async (terminal) => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ accepted: 1, job_id: "job-1" }, { status: 202 }))
    .mockResolvedValueOnce(Response.json({ job_id: "job-1", status: "leased", completed_conversations: 0, conversation_count: 1 }))
    .mockResolvedValueOnce(Response.json({ job_id: "job-1", status: terminal, completed_conversations: 1, conversation_count: 1 }));
  vi.stubGlobal("fetch", fetch);
  const form = UploadForm({ hasPartnerExport: true });
  const done = form.props.onSubmit({ preventDefault() {} });
  await vi.advanceTimersByTimeAsync(0);
  expect(h.push).not.toHaveBeenCalled(); expect(h.refresh).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000); await done;
  expect(fetch).toHaveBeenCalledWith("/api/jobs/job-1", expect.objectContaining({ cache: "no-store" }));
  if (terminal === "succeeded") {
    expect(h.push).toHaveBeenCalledOnce(); expect(h.refresh).toHaveBeenCalledOnce();
    expect(h.push.mock.calls[0][0]).toContain("imported=1");
    expect(h.push.mock.calls[0][0]).toContain("file=week.csv");
    expect(h.push.mock.calls[0][0]).not.toContain("signals=0");
  }
  else { expect(h.push).not.toHaveBeenCalled(); expect(h.setters[5]).toHaveBeenCalledWith(expect.stringMatching(/failed|cancelled/i)); }
});
it("rejects a blank upload name before polling", async () => {
  h.fileName = " ";
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ accepted: 1, job_id: "job-1" }, { status: 202 }));
  vi.stubGlobal("fetch", fetch);
  const form = UploadForm({ hasPartnerExport: true });
  await form.props.onSubmit({ preventDefault() {} });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(h.push).not.toHaveBeenCalled();
  expect(h.setters[5]).toHaveBeenCalledWith(expect.stringMatching(/file name/i));
});
