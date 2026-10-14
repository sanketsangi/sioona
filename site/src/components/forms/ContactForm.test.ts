// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ContactForm } from "./ContactForm";
import { NavigationGuardProvider } from "../navigation/GuardedLink";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it.each(["mismatch", "timeout"])("preserves fields, support fallback and retry identity after %s", async (failure) => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const fetch = vi.fn()
    .mockImplementationOnce(() => failure === "timeout" ? Promise.reject(new DOMException("Timed out", "TimeoutError")) : Promise.resolve(Response.json({ ok: true, receipt: "wrong-receipt" })))
    .mockImplementationOnce((_url, options) => Promise.resolve(Response.json({
      ok: true, receipt: options.headers["Idempotency-Key"],
    })));
  vi.stubGlobal("fetch", fetch);
  const timeout = vi.spyOn(AbortSignal, "timeout");
  try {
    act(() => root.render(createElement(NavigationGuardProvider, null, createElement(ContactForm, { supportEmail: "help@example.test" }))));
    for (const [name, value] of Object.entries({ name: "Reviewer", email: "reviewer@example.test", company: "Company" })) {
      const input = host.querySelector(`input[name="${name}"]`) as HTMLInputElement;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    const submit = () => act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await submit();
    expect(host.textContent).not.toContain("Request received");
    expect(timeout).toHaveBeenCalledWith(12000);
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(host.querySelector('input[name="companyWebsite"]')?.getAttribute("tabindex")).toBe("-1");
    expect(host.querySelector('a[href="mailto:help%40example.test"]')).not.toBeNull();
    expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("Reviewer");
    await submit();
    expect(fetch.mock.calls[1][1].headers["Idempotency-Key"]).toBe(fetch.mock.calls[0][1].headers["Idempotency-Key"]);
    expect(host.textContent).toContain("Request received");
    expect(host.textContent).toContain(fetch.mock.calls[0][1].headers["Idempotency-Key"]);
  } finally {
    act(() => root.unmount()); host.remove(); timeout.mockRestore(); vi.unstubAllGlobals();
  }
});
