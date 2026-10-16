// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const preferences = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/lib/useMediaQuery", () => ({ useMediaQuery: () => preferences.reduced }));
import { AnalyticsFeatureStage, EvidenceFeatureStage, ShadowFeatureStage, SignalPillStage } from "./BentoVisuals";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let observerCallback: IntersectionObserverCallback;
const disconnect = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  preferences.reduced = false;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { observerCallback = callback; }
    observe() {}
    disconnect = disconnect;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function visible(isIntersecting: boolean) {
  act(() => observerCallback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));
}
function advance(ms: number) { act(() => vi.advanceTimersByTime(ms)); }
function stage() { return host.querySelector("[data-feature]") as HTMLElement; }
function open() { return host.querySelector('[data-open="true"]')?.getAttribute("aria-label"); }

it("ticks evaluation only in view, pauses in hidden tabs, and cleans up on unmount", () => {
  act(() => root.render(createElement(AnalyticsFeatureStage)));
  advance(4000); expect(stage().dataset.step).toBe("0");
  visible(true); advance(1000); expect(stage().dataset.step).toBe("1");
  visible(false); advance(8000); expect(stage().dataset.step).toBe("1");
  visible(true); advance(1000); expect(stage().dataset.step).toBe("2");
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(stage().dataset.running).toBe("false");
  advance(8000); expect(stage().dataset.step).toBe("2");
  expect(vi.getTimerCount()).toBe(0);
  act(() => root.unmount()); expect(disconnect).toHaveBeenCalled();
});

it("cycles all pills every 2.2 seconds and pins hover and keyboard focus independently", () => {
  act(() => root.render(createElement(SignalPillStage)));
  visible(true);
  advance(2200); expect(open()).toBe("Lead: Buying intent");
  advance(2200); expect(open()).toBe("Upsell: Expansion");
  advance(2200); expect(open()).toBe("Review: Human verdict");
  advance(2200); expect(open()).toBe("Retention: Needs review");
  const buttons = host.querySelectorAll<HTMLButtonElement>(".feature-signal-pill");
  act(() => buttons[2].dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  advance(8800); expect(open()).toBe("Upsell: Expansion");
  expect(vi.getTimerCount()).toBe(0);
  act(() => buttons[1].focus());
  act(() => buttons[2].dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
  advance(8800); expect(open()).toBe("Lead: Buying intent");
  act(() => buttons[1].blur());
  advance(2200); expect(open()).toBe("Lead: Buying intent");
  advance(2200); expect(open()).toBe("Upsell: Expansion");
});

it("omits desktop captions and playback buttons from every feature stage", () => {
  for (const Component of [ShadowFeatureStage, AnalyticsFeatureStage, EvidenceFeatureStage, SignalPillStage]) {
    act(() => root.render(createElement(Component)));
    expect(host.querySelector(".feature-playback")).toBeNull();
    expect(host.querySelector(".feature-desktop-note")).toBeNull();
    expect(host.textContent).not.toContain("Illustrative workspace");
    expect(host.textContent).not.toContain("Example data · human-reviewed signals");
  }
});

it("settles all stages without timers when reduced motion is requested", () => {
  act(() => root.render(createElement(AnalyticsFeatureStage)));
  visible(true); advance(1000);
  preferences.reduced = true;
  act(() => root.render(createElement(AnalyticsFeatureStage)));
  expect(stage().dataset.motion).toBe("false");
  expect(stage().dataset.running).toBe("false");
  expect(stage().dataset.step).toBe("3");
  expect(vi.getTimerCount()).toBe(0);
  expect(host.querySelector(".feature-playback")).toBeNull();
  for (const Component of [ShadowFeatureStage, AnalyticsFeatureStage, EvidenceFeatureStage, SignalPillStage]) {
    const html = renderToStaticMarkup(createElement(Component));
    expect(html).toContain('data-motion="false"');
    expect(html).toContain("<noscript>");
    expect(html).not.toContain("feature-playback");
  }
});
