// @vitest-environment jsdom
import { act, createElement, type ComponentProps, type MouseEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type NextLink from "next/link";

const navigate = vi.fn();
vi.mock("next/link", () => ({ default: ({ onNavigate, href, children, ...props }: ComponentProps<typeof NextLink>) =>
  createElement("a", { ...props, prefetch: undefined, href: String(href), onClick: (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || props.target === "_blank") return;
    let prevented = false;
    onNavigate?.({ preventDefault: () => { prevented = true; } });
    if (!prevented) navigate(href);
  } }, children) }));
import GuardedLink, { NavigationGuardProvider } from "./GuardedLink";
import { ContactForm } from "../forms/ContactForm";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  navigate.mockClear();
  Object.defineProperty(window, "navigation", { configurable: true, value: new EventTarget() });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  act(() => root.render(createElement(NavigationGuardProvider, null,
    createElement(ContactForm), createElement(GuardedLink, { href: "/pricing" }, "Header pricing"),
    createElement(GuardedLink, { href: "#main" }, "Same page"))));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
function enterName(value: string) {
  const input = host.querySelector('input[name="name"]') as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function click(href: string) { act(() => (host.querySelector(`a[href="${href}"]`) as HTMLAnchorElement).click()); }
it("allows clean forms, guards header and form links, and retains input after cancel", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  click("/pricing"); expect(navigate).toHaveBeenCalledWith("/pricing"); expect(confirm).not.toHaveBeenCalled();
  navigate.mockClear(); enterName("Alex");
  click("/pricing"); click("/privacy"); click("/terms");
  expect(confirm).toHaveBeenCalledTimes(3); expect(navigate).not.toHaveBeenCalled();
  expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("Alex");
  confirm.mockReturnValue(true); click("/privacy"); expect(navigate).toHaveBeenCalledWith("/privacy");
});
it("allows hash links and new-tab clicks without a discard prompt and clears the guard when emptied", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  enterName("Alex"); click("#main");
  act(() => host.querySelector('a[href="/pricing"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })));
  expect(confirm).not.toHaveBeenCalled();
  enterName(""); click("/pricing"); expect(confirm).not.toHaveBeenCalled();
});
it("warns on document unload while dirty and removes the handler after clearing", () => {
  enterName("Alex");
  const dirtyUnload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(dirtyUnload);
  expect(dirtyUnload.defaultPrevented).toBe(true);
  enterName(""); const cleanUnload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
});

it("guards browser history traversals before the form unmounts", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  enterName("Alex");
  const navigation = (window as Window & { navigation?: EventTarget }).navigation!;
  const event = new Event("navigate", { cancelable: true });
  Object.assign(event, { navigationType: "traverse", destination: { url: new URL("/pricing", window.location.href).href } });
  navigation.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  confirm.mockReturnValue(true);
  const allowed = new Event("navigate", { cancelable: true });
  Object.assign(allowed, { navigationType: "traverse", destination: { url: new URL("/pricing", window.location.href).href } });
  navigation.dispatchEvent(allowed);
  expect(allowed.defaultPrevented).toBe(false);
});
