// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, onNavigate, onClick, ...props }: { href: string; children?: ReactNode; onNavigate?: (event: { preventDefault: () => void }) => void; onClick?: (event: MouseEvent) => void }) =>
    createElement("a", { href, ...props, prefetch: undefined, onClick: (event: MouseEvent) => { event.preventDefault(); onClick?.(event); onNavigate?.({ preventDefault() {} }); }, "data-guarded": Boolean(onNavigate) }, children),
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
    navigation.pathname = "/";
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

  it("opens only on mouse hover over Product and stays open when entering the dropdown", () => {
    vi.useFakeTimers();
    const enter = (target: Element, pointerType = "mouse") => act(() => target.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType })));
    const wrapper = productButton().parentElement!;
    enter(wrapper);
    expect(menu().dataset.open).toBe("false");
    enter(productButton(), "touch");
    expect(menu().dataset.open).toBe("false");
    enter(productButton());
    expect(menu().dataset.open).toBe("true");
    act(() => wrapper.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body })));
    enter(menu());
    act(() => vi.advanceTimersByTime(180));
    expect(menu().dataset.open).toBe("true");
    act(() => wrapper.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body })));
    act(() => vi.advanceTimersByTime(180));
    expect(menu().dataset.open).toBe("false");
    vi.useRealTimers();
  });

  it("always links How It Works to its dedicated page on desktop and mobile", () => {
    for (const pathname of ["/", "/pricing", "/security"]) {
      navigation.pathname = pathname;
      act(() => root?.render(createElement(SiteNav)));
      const links = [...(host?.querySelectorAll("nav a") ?? [])].filter((link) => link.textContent === "How It Works");
      expect(links).toHaveLength(2);
      for (const link of links) expect(link.getAttribute("href")).toBe("/how-it-works");
    }
  });

  it("resets scroll after header navigation, including same-page clicks, but leaves history navigation alone", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const link = host?.querySelector('a.nav-link[href="/pricing"]') as HTMLAnchorElement;
    act(() => link.click());
    expect(scroll).not.toHaveBeenCalled();
    navigation.pathname = "/pricing";
    act(() => root?.render(createElement(SiteNav)));
    expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
    scroll.mockClear();
    act(() => link.click());
    expect(scroll).toHaveBeenCalledTimes(1);
    scroll.mockClear();
    navigation.pathname = "/security";
    act(() => root?.render(createElement(SiteNav)));
    expect(scroll).not.toHaveBeenCalled();
    scroll.mockRestore();
  });

  it("requires Play for each selected preview", () => {
    expect(menu().querySelector('[data-preview-running="true"]')).toBeNull();
    act(() => productButton().click());
    const preview = menu().querySelector('[data-active="true"].product-preview-content');
    expect(preview?.getAttribute("data-preview-running")).toBe("false");
    act(() => (preview?.querySelector("button") as HTMLButtonElement).click());
    expect(preview?.getAttribute("data-preview-running")).toBe("true");
    const workflow = menu().querySelector('a[href="/#how"]');
    act(() => workflow?.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    expect(menu().querySelectorAll('[data-preview-running="true"]')).toHaveLength(0);
    act(() => (menu().querySelector('[data-active="true"].product-preview-content button') as HTMLButtonElement).click());
    expect(menu().querySelectorAll('[data-preview-running="true"]')).toHaveLength(1);
    expect(menu().querySelector('[data-preview-running="true"]')?.textContent).toContain("From chat to action");
    act(() => productButton().click());
    expect(menu().querySelector('[data-preview-running="true"]')).toBeNull();
  });

  it("keeps the menu open when switching previews removes the focused playback control", () => {
    const button = productButton();
    act(() => button.click());
    act(() => button.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null })));
    expect(button.getAttribute("aria-expanded")).toBe("true");
    act(() => button.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body })));
    expect(button.getAttribute("aria-expanded")).toBe("false");
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

it("closes the product menu on Escape when pointer interaction left focus outside it", () => {
  act(() => productButton().click());
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(productButton().getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(productButton());
});

it("restores drawer focus even when opening by pointer did not focus the trigger", () => {
  vi.useFakeTimers();
  try {
    const trigger = host?.querySelector('button[aria-label="Open Menu"]') as HTMLButtonElement;
    const dialog = host?.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new Event("close")); };
    act(() => trigger.click());
    act(() => (dialog.querySelector('button') as HTMLButtonElement).focus());
    act(() => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));
    act(() => vi.advanceTimersByTime(200));
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  } finally { vi.useRealTimers(); }
});

});
