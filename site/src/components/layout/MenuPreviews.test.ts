// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (original) => ({ ...await original<typeof import("framer-motion")>(), useReducedMotion: () => motion.reduced }));
vi.mock("@/app/how-it-works/FourStepScroll", () => ({ Stage: ({ step }: { step: number }) => createElement("div", { "data-step": step }) }));
import { WorkflowPreview } from "./MenuPreviews";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let host: HTMLDivElement;
beforeEach(() => { vi.useFakeTimers(); motion.reduced = false; host = document.createElement("div"); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); });
function render(running: boolean) { act(() => root.render(createElement(WorkflowPreview, { running }))); }
function step() { return host.querySelector("[data-step]")?.getAttribute("data-step"); }
it("starts static, plays on request, freezes when paused or hidden, and resumes", () => {
  render(false); act(() => vi.advanceTimersByTime(5000)); expect(step()).toBe("3");
  render(true); act(() => vi.advanceTimersByTime(2200)); expect(step()).toBe("0");
  render(false); act(() => vi.advanceTimersByTime(5000)); expect(step()).toBe("0");
  render(true); act(() => vi.advanceTimersByTime(2200)); expect(step()).toBe("1");
});
it("never advances under reduced motion even when play is requested", () => {
  motion.reduced = true; render(true); act(() => vi.advanceTimersByTime(5000)); expect(step()).toBe("3");
});
