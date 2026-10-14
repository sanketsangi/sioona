// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ContactForm } from "./ContactForm";
import { NavigationGuardProvider } from "../navigation/GuardedLink";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps fields and retry identity after an uncertain receipt, then acknowledges the matching receipt", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, receipt: "wrong-receipt" }))
    .mockImplementationOnce((_url, options) => Promise.resolve(Response.json({
      ok: true, receipt: options.headers["Idempotency-Key"],
    })));
  vi.stubGlobal("fetch", fetch);
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
    expect(host.querySelector('a[href="mailto:help%40example.test"]')).not.toBeNull();
    expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("Reviewer");
    await submit();
    expect(fetch.mock.calls[1][1].headers["Idempotency-Key"]).toBe(fetch.mock.calls[0][1].headers["Idempotency-Key"]);
    expect(host.textContent).toContain("Request received");
    expect(host.textContent).toContain(fetch.mock.calls[0][1].headers["Idempotency-Key"]);
  } finally {
    act(() => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});
