// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LazyMotion, domAnimation } from "framer-motion";
import { FaqList } from "./FaqList";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
function render() { act(() => root.render(createElement(LazyMotion, { features: domAnimation }, createElement(FaqList)))); }
function history(hash: string) {
  act(() => { window.history.replaceState(null, "", `/${hash}`); window.dispatchEvent(new PopStateEvent("popstate")); });
}
function trigger(id: string) { return host.querySelector(`#faq-${id}`) as HTMLButtonElement; }
describe("FAQ navigation", () => {
  it("opens deep links on hydration", () => {
    window.history.replaceState(null, "", "/#faq-what-is-sioona"); render();
    expect(trigger("what-is-sioona").getAttribute("aria-expanded")).toBe("true");
  });
  it("restores the previous panel and closes panels when navigating back to the section", () => {
    render(); act(() => trigger("what-is-sioona").click());
    history("#faq-what-is-shadow-mode");
    expect(trigger("what-is-shadow-mode").getAttribute("aria-expanded")).toBe("true");
    expect(trigger("what-is-sioona").getAttribute("aria-expanded")).toBe("false");
    history("#faq"); expect(host.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
  });
  it("links visible panels to their labelled buttons and closes on repeat activation", () => {
    render(); const button = trigger("pilot-length"); act(() => button.click());
    expect(window.location.hash).toBe("#faq-pilot-length");
    const panel = host.querySelector(`#${button.getAttribute("aria-controls")}`) as HTMLElement;
    expect(panel.getAttribute("aria-hidden")).toBe("false"); expect(panel.getAttribute("aria-labelledby")).toBe(button.id);
    act(() => button.click()); expect(panel.getAttribute("aria-hidden")).toBe("true"); expect(panel.hasAttribute("inert")).toBe(true);
  });
});
