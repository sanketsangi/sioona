// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STEP, useInsightsScript } from "./useInsightsScript";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
function Harness({ running, reduced = false }: { running: boolean; reduced?: boolean }) {
  const result = useInsightsScript({ totalChars: 5, running, reduced });
  return createElement("output", null, `${result.step}:${result.chars}`);
}
function render(running: boolean, reduced = false) { act(() => root.render(createElement(Harness, { running, reduced }))); }
beforeEach(() => { vi.useFakeTimers(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });
describe("Demo timer lifecycle", () => {
  it("renders a complete frame without starting timers while paused", () => {
    render(false); act(() => vi.advanceTimersByTime(10000));
    expect(host.textContent).toBe(`${STEP.acted}:5`); expect(vi.getTimerCount()).toBe(0);
  });
  it("advances on play and cancels timers when it leaves the viewport or pauses", () => {
    render(true); act(() => vi.advanceTimersByTime(3000)); expect(host.textContent).toBe(`${STEP.reset}:5`);
    render(false); const paused = host.textContent; act(() => vi.advanceTimersByTime(10000));
    expect(host.textContent).toBe(paused); expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps reduced motion static even if playback is requested", () => {
    render(true,true); act(() => vi.advanceTimersByTime(10000));
    expect(host.textContent).toBe(`${STEP.acted}:5`); expect(vi.getTimerCount()).toBe(0);
  });
  it("repeats complete cycles until playback is paused", () => {
    render(true);
    let resets = 0;
    const steps = new Set<number>();
    for (let tick = 0; tick < 40; tick++) {
      act(() => vi.advanceTimersToNextTimer());
      const step = Number(host.textContent?.split(":")[0]);
      steps.add(step);
      if (step === STEP.reset) resets++;
    }
    expect(resets).toBeGreaterThanOrEqual(2);
    expect(steps.size).toBe(8);
    render(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
