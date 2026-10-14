// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LazyMotion, domAnimation } from "framer-motion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const motionState = vi.hoisted(() => ({ visible: false, reduced: false, options: null as unknown }));
vi.mock("framer-motion", async (original) => ({ ...await original<typeof import("framer-motion")>(), useInView: (_ref: unknown, options: unknown) => { motionState.options = options; return motionState.visible; }, useReducedMotion: () => motionState.reduced }));
import { InsightsMock } from "./InsightsMock";
import { HeroPreviewEntered } from "@/components/sections/HeroPreview";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => { motionState.visible = false; motionState.reduced = false; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
describe("Hero demo playback", () => {
  function render() {
    act(() => root.render(createElement(LazyMotion, { features: domAnimation }, createElement(HeroPreviewEntered.Provider, { value: motionState.visible }, createElement(InsightsMock, { previewHeader: true })))));
  }
  it("starts paused on entry, then plays, pauses and resumes", () => {
    render();
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('false');
    expect(motionState.options).toMatchObject({ once: false, amount: "some", margin: "0px" });
    motionState.visible = true; render();
    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Play Demo Animation");
    act(() => button.click());
    expect(button.getAttribute("aria-label")).toBe("Pause Demo Animation");
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('true');
    act(() => button.click()); expect(button.getAttribute("aria-label")).toBe("Play Demo Animation");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    render(); expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('false');
    act(() => button.click()); expect(button.getAttribute("aria-label")).toBe("Pause Demo Animation");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });
  it("pauses offscreen and resumes on re-entry without overriding manual pause", () => {
    motionState.visible = true; render();
    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Play Demo Animation");
    act(() => button.click());
    motionState.visible = false; render();
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('false');
    motionState.visible = true; render();
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('true');
    act(() => button.click());
    motionState.visible = false; render();
    motionState.visible = true; render();
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('false');
  });
  it("suspends while the tab is hidden, then resumes", () => {
    vi.useFakeTimers();
    motionState.visible = true;
    render();
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    expect(host.querySelector("figure")?.dataset.demoRunning).toBe("true");
    const step = host.querySelector("figure")?.dataset.demoStep;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(host.querySelector("figure")?.dataset.demoRunning).toBe("false");
    act(() => vi.advanceTimersByTime(12000));
    expect(host.querySelector("figure")?.dataset.demoStep).toBe(step);
    vi.restoreAllMocks();
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(host.querySelector("figure")?.dataset.demoRunning).toBe("true");
    vi.useRealTimers();
  });
  it("stops playback when reduced motion is requested", () => {
    motionState.visible = true; render();
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    motionState.reduced = true; render();
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('false');
  });
});
