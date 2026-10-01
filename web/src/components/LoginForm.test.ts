import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    refresh: () => {},
  }),
}));

import { LoginForm, signInFailureMessage } from "@/components/LoginForm";
import LoginPage from "@/app/login/page";

const INCORRECT = "Email or password is incorrect.";
const GENERIC = "Sign-in failed. Try again.";

describe("LoginForm", () => {
  it("renders email, password, sign-in, and a live error region", () => {
    const html = renderToStaticMarkup(createElement(LoginForm));

    expect(html).toContain(">Email<");
    expect(html).toContain(">Password<");
    expect(html).toMatch(/autoComplete="username"|autocomplete="username"/);
    expect(html).toMatch(
      /autoComplete="current-password"|autocomplete="current-password"/,
    );
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(">Sign in<");
    expect(html).toContain('type="submit"');
  });
});

describe("signInFailureMessage", () => {
  it("uses one incorrect-credentials sentence for a 401", () => {
    expect(signInFailureMessage(401)).toBe(INCORRECT);
    expect(signInFailureMessage(401)).not.toMatch(/not found|does not exist|no account/i);
  });

  it("uses a generic sentence for server and network failures", () => {
    expect(signInFailureMessage(500)).toBe(GENERIC);
    expect(signInFailureMessage(0)).toBe(GENERIC);
    expect(signInFailureMessage(500)).not.toMatch(/not found|does not exist|no account/i);
    expect(signInFailureMessage(0)).not.toMatch(/not found|does not exist|no account/i);
  });
});

describe("login public demo link", () => {
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ["SIOONA_PUBLIC_DEMO", "VERCEL_ENV", "NODE_ENV"]) {
      previous[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("shows the demo link only when the public demo is enabled", () => {
    process.env.SIOONA_PUBLIC_DEMO = "1";
    const shown = renderToStaticMarkup(createElement(LoginPage));
    expect(shown).toContain("View the public demo");
    expect(shown).toContain('href="/"');
    expect(shown).toContain("Sign in to");
    expect(shown).toContain("Shadow Mode:");

    process.env.SIOONA_PUBLIC_DEMO = "0";
    const hidden = renderToStaticMarkup(createElement(LoginPage));
    expect(hidden).not.toContain("View the public demo");
    expect(hidden).not.toContain("Back to the app");
  });
});
