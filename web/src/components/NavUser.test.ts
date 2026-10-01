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

import { NavUser } from "@/components/NavUser";
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

  it("shows a public demo identity and a sign-in link", () => {
    const html = renderNav(anonymousDemoAccount());

    expect(html).toContain("Demo");
    expect(html).toContain("Public demo");
    expect(html).toContain('aria-label="Demo, Public demo"');
    expect(html).toContain('href="/login"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("maya-chen");
  });
});
