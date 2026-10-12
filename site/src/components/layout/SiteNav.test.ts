// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/components/layout/MenuPreviews", () => {
  function OutputPreview() {
    return createElement("div", { "data-preview": "output" });
  }
  function WorkflowPreview() {
    return createElement("div", { "data-preview": "workflow" });
  }
  function ScorePreview() {
    return createElement("div", { "data-preview": "score" });
  }
  function FeaturePreview() {
    return createElement("div", { "data-preview": "feature" });
  }
  return { OutputPreview, WorkflowPreview, ScorePreview, FeaturePreview };
});

import { SiteNav } from "./SiteNav";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

let intersectionCallback: ((entries: Array<{ intersectionRatio: number }>) => void) | undefined;

function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function installIntersectionObserver() {
  class MockObserver {
    constructor(callback: (entries: Array<{ intersectionRatio: number }>) => void) {
      intersectionCallback = callback;
    }
    observe() {
      intersectionCallback?.([{ intersectionRatio: 1 }]);
    }
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal("IntersectionObserver", MockObserver);
}

function backdrop() {
  const node = host?.querySelector("header");
  if (!(node instanceof HTMLElement)) throw new Error("Navigation bar missing");
  return node;
}

function renderNav() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(createElement(SiteNav));
  });
}

function productButton() {
  const button = host?.querySelector("button.product-trigger");
  if (!(button instanceof HTMLButtonElement)) throw new Error("Product trigger missing");
  return button;
}

function menu() {
  const node = host?.querySelector("#product-navigation");
  if (!(node instanceof HTMLElement)) throw new Error("Product menu missing");
  return node;
}

describe("Product dropdown", () => {
  beforeEach(() => {
    window.location.hash = "";
    installMatchMedia();
    installIntersectionObserver();
    renderNav();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = undefined;
    host = undefined;
  });

  it("opens and closes on click", () => {
    const button = productButton();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu().getAttribute("data-open")).toBe("false");

    act(() => {
      button.click();
    });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(menu().getAttribute("data-open")).toBe("true");

    act(() => {
      button.click();
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu().getAttribute("data-open")).toBe("false");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    const button = productButton();
    act(() => {
      button.click();
    });
    const link = menu().querySelector("a");
    if (!(link instanceof HTMLAnchorElement)) throw new Error("Product link missing");

    act(() => {
      link.focus();
      link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("closes on an outside click", () => {
    const button = productButton();
    act(() => {
      button.click();
    });
    expect(button.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes when a product link is followed", () => {
    const button = productButton();
    act(() => {
      button.click();
    });
    const link = menu().querySelector('a[href="/#product"]');
    if (!(link instanceof HTMLAnchorElement)) throw new Error("Product link missing");

    act(() => {
      link.click();
    });

    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("turns solid after a hash jump without a scroll event", () => {
    expect(backdrop().getAttribute("data-scrolled")).toBe("false");
    expect(backdrop().className).toContain("bg-transparent");

    act(() => {
      window.location.hash = "#product";
      Object.defineProperty(window, "scrollY", { configurable: true, value: 640 });
      intersectionCallback?.([{ intersectionRatio: 0 }]);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(backdrop().getAttribute("data-scrolled")).toBe("true");
    expect(backdrop().className).toContain("data-[scrolled=true]:bg-sio-bg-base");
    expect(backdrop().className).not.toContain("opacity-0");
  });
});
