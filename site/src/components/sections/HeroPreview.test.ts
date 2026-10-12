// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LazyMotion, domAnimation } from "framer-motion";
const motionState = vi.hoisted(() => ({ visible: false, reduced: false, options: null as unknown }));
vi.mock("framer-motion", async (original) => ({ ...await original<typeof import("framer-motion")>(),
  useInView: (_ref: unknown, options: unknown) => { motionState.options = options; return motionState.visible; },
  useReducedMotion: () => motionState.reduced,
}));
import { HeroPreview } from "./HeroPreview";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let host: HTMLDivElement;
beforeEach(() => { motionState.visible = false; motionState.reduced = false; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
function render() { act(() => root.render(createElement(LazyMotion,{features:domAnimation},createElement(HeroPreview,null,createElement("button",null,"Play demo"))))); }
describe("Preview entrance", () => {
  it("observes a stable frame without requiring a fraction of the tall preview", () => {
    render(); expect(host.querySelector('[data-preview-trigger]')).not.toBeNull();
    expect(motionState.options).toMatchObject({once:true,amount:"some"});
    expect(host.querySelector('.hero-preview')?.getAttribute('data-entered')).toBe('false');
    motionState.visible = true; render(); expect(host.querySelector('.hero-preview')?.getAttribute('data-entered')).toBe('true');
  });
  it("shows immediately in reduced motion", () => {
    motionState.reduced = true; render(); expect(host.querySelector('.hero-preview')?.getAttribute('data-entered')).toBe('true');
  });
  it("reveals when keyboard focus reaches its control", () => {
    render(); act(() => (host.querySelector('button') as HTMLButtonElement).focus());
    expect(host.querySelector('.hero-preview')?.getAttribute('data-entered')).toBe('true');
  });
  it("handles a scroll jump that skips intersection observation", async () => {
    let top = 1200;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => new DOMRect(0, top, 320, 1000));
    try {
      render();
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
      expect(host.querySelector('.hero-preview')?.getAttribute('data-entered')).toBe('false');
      top = -2000;
      await act(async () => { window.dispatchEvent(new Event("scroll")); await new Promise(resolve => setTimeout(resolve, 30)); });
      expect(host.querySelector('.hero-preview')?.getAttribute('data-entered')).toBe('true');
    } finally { rect.mockRestore(); }
  });
});
