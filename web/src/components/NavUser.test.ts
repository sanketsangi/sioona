import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children?: unknown;
    className?: string;
    [key: string]: unknown;
  }) => createElement("a", { href, className, ...rest }, children as never),
}));

import { NavUser, SignOutControl } from "@/components/NavUser";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  accountSurface,
  anonymousDemoAccount,
} from "@/lib/account-surface";

function renderNav(account: ReturnType<typeof anonymousDemoAccount>) {
  return renderToStaticMarkup(
    createElement(
      SidebarProvider,
      null,
      createElement(NavUser, { account }),
    ),
  );
}

describe("NavUser", () => {
  it("shows the signed-in email and role with sign-out", () => {
    const account = accountSurface({
      session: { email: "reviewer@partner.example", role: "reviewer" },
      authOn: true,
      publicDemo: false,
    });
    expect(account).not.toBeNull();
    const html = renderNav(account!);

    expect(html).toContain("reviewer@partner.example");
    expect(html).toContain("Reviewer");
    expect(html).toContain('aria-label="reviewer@partner.example, Reviewer"');
    expect(html).toContain('aria-label="Sign out reviewer@partner.example"');
    expect(html).toContain("Sign out");
    expect(html).toContain(">R</span>");
    expect(html).not.toContain("Sanket Sangi");
    expect(html).not.toContain("sanket@sioona.ai");
    expect(html).not.toContain("maya-chen");
  });

  it("renders one icon-only sign-out control for both sidebar states", () => {
    const account = accountSurface({
      session: { email: "reviewer@partner.example", role: "reviewer" },
      authOn: true,
      publicDemo: false,
    })!;
    const html = renderNav(account);

    expect(html.match(/data-sign-out/g)).toHaveLength(1);
    expect(html.match(/aria-label="Sign out /g)).toHaveLength(1);
    expect(html).not.toContain(">Sign out</span>");
    expect(html).toContain('data-size="icon"');
    expect(html).toContain("group-data-[collapsible=icon]:flex-col");
    expect(html).toContain("before:-inset-1.5");
    expect(html).toContain("focus-visible:shadow-[var(--focus-ring)]");
    expect(html).toContain('aria-busy="false"');
  });

  it("colors icons from tokens, not a hardcoded hex", () => {
    const signedIn = renderNav(
      accountSurface({
        session: { email: "reviewer@partner.example", role: "reviewer" },
        authOn: true,
        publicDemo: false,
      })!,
    );
    const anonymous = renderNav(anonymousDemoAccount());

    for (const html of [signedIn, anonymous]) {
      expect(html).not.toContain("#666666");
      expect(html).toContain('fill="currentColor"');
      expect(html).toContain("text-sio-fg-subtle");
    }
  });

  it("disables sign-out and shows the spinner while pending", () => {
    const account = accountSurface({
      session: { email: "reviewer@partner.example", role: "reviewer" },
      authOn: true,
      publicDemo: false,
    })!;
    const html = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(SignOutControl, {
          account,
          pending: true,
          onSignOut: () => {},
        }),
      ),
    );

    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Sign out reviewer@partner.example"');
    expect(html).toContain('data-slot="spinner"');
    expect(html).not.toContain("M10.75 8.75H11.5");
  });

  it("hides the demo identity and shows a sign-in link", () => {
    const html = renderNav(anonymousDemoAccount());

    expect(html).not.toContain("Public demo");
    expect(html).not.toContain('aria-label="Demo, Public demo"');
    expect(html).toContain('href="/login"');
    expect(html).toContain('data-variant="outline"');
    expect(html).toContain("group-data-[collapsible=icon]:hidden");
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("maya-chen");
  });
});
