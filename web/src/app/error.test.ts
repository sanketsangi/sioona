import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import InsightsError from "./error";

describe("Insights error boundary", () => {
  it("offers a retry control and does not render a fallback store", () => {
    const html = renderToStaticMarkup(
      createElement(InsightsError, {
        error: Object.assign(
          new Error("Canonical conversation read unavailable; retry the request."),
          { digest: "digest" },
        ),
        reset: () => undefined,
      }),
    );
    expect(html).toContain("Retry the request");
    expect(html).toContain("Postgres could not be read.");
    expect(html).not.toContain("emptyStoreForTenant");
    expect(html).not.toContain("Groww");
    expect(html).not.toContain("baselineOpportunities");
    expect(html).not.toContain("tenant_demo");
  });
});
