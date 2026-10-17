// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (original) => ({ ...await original<typeof import("framer-motion")>(), useReducedMotion: () => motion.reduced }));
vi.mock("@/app/how-it-works/FourStepScroll", () => ({ Stage: ({ step }: { step: number }) => createElement("div", { "data-step": step }) }));
import { FeaturePreview, WorkflowPreview } from "./MenuPreviews";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let host: HTMLDivElement;
beforeEach(() => { vi.useFakeTimers(); motion.reduced = false; host = document.createElement("div"); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); });
function render(running: boolean) { act(() => root.render(createElement(WorkflowPreview, { running }))); }
function step() { return host.querySelector("[data-step]")?.getAttribute("data-step"); }
function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 1) act(() => vi.advanceTimersByTime(1));
}
it("starts immediately, advances promptly, and restarts on hover", () => {
  render(false); advance(5000); expect(step()).toBe("0");
  render(true); expect(step()).toBe("1");
  advance(1499); expect(step()).toBe("1");
  advance(1); expect(step()).toBe("2");
  render(false); advance(5000); expect(step()).toBe("2");
  render(true); expect(step()).toBe("1");
  advance(1500); expect(step()).toBe("2");
  advance(1600); expect(step()).toBe("3");
  advance(2200); expect(step()).toBe("0");
  advance(900); expect(step()).toBe("1");
  advance(1500); expect(step()).toBe("2");
});
it("never advances under reduced motion even when play is requested", () => {
  motion.reduced = true; render(true); act(() => vi.advanceTimersByTime(5000)); expect(step()).toBe("3");
});

function installFeatureEnvironment() {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (media: string) => ({
    matches: motion.reduced, media, addEventListener() {}, removeEventListener() {},
  }) });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() {}
  });
}
function renderFeatures(running: boolean) { act(() => root.render(createElement(FeaturePreview, { running }))); }
function currentFeature() { return [...host.querySelectorAll<HTMLElement>("[data-feature]")].at(-1)!; }

it("runs all four shared feature scenes inside the dropdown and loops back", () => {
  installFeatureEnvironment();
  renderFeatures(true);
  expect(currentFeature().classList.contains("feature-shadow")).toBe(true);
  advance(1800);
  expect(currentFeature().dataset.step).toBe("1");
  advance(6200);
  expect(currentFeature().classList.contains("feature-analytics")).toBe(true);
  expect(currentFeature().textContent).toContain("Last 30 days");
  expect(currentFeature().querySelectorAll(".feature-chart > span")).toHaveLength(10);
  advance(1000);
  expect(currentFeature().dataset.step).toBe("1");
  advance(7000);
  expect(currentFeature().classList.contains("feature-evidence")).toBe(true);
  expect(currentFeature().querySelectorAll(".feature-transcript > *")).toHaveLength(3);
  advance(8000);
  expect(currentFeature().classList.contains("feature-pill-stage")).toBe(true);
  expect(currentFeature().querySelectorAll("button")).toHaveLength(4);
  advance(2200);
  expect(currentFeature().querySelector('[aria-pressed="true"]')?.getAttribute("aria-label")).toBe("Lead: Buying intent");
  advance(5800);
  expect(currentFeature().classList.contains("feature-shadow")).toBe(true);
  expect(host.querySelector(".bento-card > h3")).toBeNull();
  expect(host.querySelector(".bento-card > p")).toBeNull();
});

it("pauses both scene cycling and each feature loop, then resumes", () => {
  installFeatureEnvironment();
  renderFeatures(true);
  advance(1800);
  renderFeatures(false);
  const pausedStep = currentFeature().dataset.step;
  expect(currentFeature().dataset.running).toBe("false");
  advance(16000);
  expect(currentFeature().classList.contains("feature-shadow")).toBe(true);
  expect(currentFeature().dataset.step).toBe(pausedStep);
  renderFeatures(true);
  advance(1800);
  expect(currentFeature().dataset.step).not.toBe(pausedStep);
  advance(6200);
  expect(currentFeature().classList.contains("feature-analytics")).toBe(true);
});

it("settles the dropdown feature preview under reduced motion", () => {
  motion.reduced = true;
  installFeatureEnvironment();
  renderFeatures(true);
  advance(32000);
  expect(currentFeature().classList.contains("feature-shadow")).toBe(true);
  expect(currentFeature().dataset.motion).toBe("false");
  expect(currentFeature().dataset.running).toBe("false");
  expect(currentFeature().dataset.step).toBe("3");
});
