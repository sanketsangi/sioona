import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${url}`), { digest: url });
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

import SignalRedirect from "./page";

describe("GET /insights/[id] redirect", () => {
  it("redirects to Insights preview with an encoded signal id", async () => {
    const id = "sig/needs-encoding?x=y";
    await expect(
      SignalRedirect({ params: Promise.resolve({ id }) })
    ).rejects.toThrow(`NEXT_REDIRECT:/`);

    expect(redirect).toHaveBeenCalledWith(
      `/?view=insights&preview=${encodeURIComponent(id)}`
    );
  });
});
