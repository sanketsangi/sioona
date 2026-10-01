import { describe, expect, it } from "vitest";

import { accountSurface } from "@/lib/account-surface";

describe("accountSurface", () => {
  it("uses the signed-in email and role", () => {
    expect(
      accountSurface({
        session: { email: "reviewer@partner.example", role: "reviewer" },
        authOn: true,
        publicDemo: false,
      }),
    ).toEqual({
      email: "reviewer@partner.example",
      role: "reviewer",
      primary: "reviewer@partner.example",
      secondary: "Reviewer",
      anonymous: false,
    });
  });

  it("labels an admin session", () => {
    const account = accountSurface({
      session: { email: "admin@partner.example", role: "admin" },
      authOn: true,
      publicDemo: true,
    });
    expect(account?.secondary).toBe("Admin");
    expect(account?.anonymous).toBe(false);
  });

  it("shows a public demo identity when nobody is signed in", () => {
    expect(
      accountSurface({
        session: null,
        authOn: true,
        publicDemo: true,
      }),
    ).toEqual({
      email: null,
      role: "demo",
      primary: "Demo",
      secondary: "Public demo",
      anonymous: true,
    });
  });

  it("shows the demo identity when auth is off", () => {
    expect(
      accountSurface({
        session: null,
        authOn: false,
        publicDemo: false,
      })?.anonymous,
    ).toBe(true);
  });

  it("returns null when sign-in is required", () => {
    expect(
      accountSurface({
        session: null,
        authOn: true,
        publicDemo: false,
      }),
    ).toBeNull();
  });
});
