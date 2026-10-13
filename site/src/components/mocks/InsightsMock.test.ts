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
  it("runs after entry until pause is clicked, then resumes from the play control", () => {
    render();
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('false');
    expect(motionState.options).toMatchObject({ once: true, amount: "some" });
    motionState.visible = true; render();
    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Pause Demo Animation");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('true');
    act(() => button.click());
    expect(button.getAttribute("aria-label")).toBe("Play Demo Animation");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('false');
    render();
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('false');
    act(() => button.click());
    expect(button.getAttribute("aria-label")).toBe("Pause Demo Animation");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('true');
  });
  it("stops playback when reduced motion is requested", () => {
    motionState.visible = true; render();
    motionState.reduced = true; render();
    expect(host.querySelector('figure')?.getAttribute('data-demo-running')).toBe('false');
  });
});
