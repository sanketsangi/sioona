import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => h }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: (initial: unknown) => [initial, vi.fn()], useRef: () => ({current:null}), useEffect: () => {} }));
import { ResetDemoButton } from "./ResetDemoButton";
import { GROWW_SHOWCASE_SAMPLE_NAME } from "@/lib/partner-demo-replace-guard";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("cancelling a destructive demo reset performs no request or navigation", async () => {
  const confirm = vi.fn().mockReturnValue(false);
  const request = vi.fn();
  vi.stubGlobal("window", {confirm}); vi.stubGlobal("fetch", request);
  const button = ResetDemoButton({lastUploadedFileName:"uploaded.csv"});
  await button.props.onClick();
  expect(confirm).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
  expect(h.push).not.toHaveBeenCalled();
});
it("an already-active sample navigates without confirmation or replacement", async () => {
  const confirm = vi.fn(); const request = vi.fn();
  vi.stubGlobal("window", {confirm}); vi.stubGlobal("fetch", request);
  await ResetDemoButton({lastUploadedFileName:GROWW_SHOWCASE_SAMPLE_NAME}).props.onClick();
  expect(confirm).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  expect(h.push).toHaveBeenCalledWith(expect.stringContaining("view=insights"));
});
