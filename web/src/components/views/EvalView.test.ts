import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StoreData } from "@/lib/types";
import type { SignalScoreWindow } from "@/lib/signal-score-window";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: unknown;
    className?: string;
  }) => createElement("a", { href, className }, children as never),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { EvalView } from "./EvalView";

const store: StoreData = {
  tenant: {
    id: "tenant_demo",
    name: "Demo",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  conversations: [],
  messages: [],
  signals: [],
  pilot: { baselineOpportunities: 12, weeklyExportCount: 4 },
};

const scoreWindow: SignalScoreWindow = {
  status: "default",
  resolvedFrom: "2026-08-23T00:00:00.000Z",
  dateInput: "2026-08-23",
  label: "Last 7 days",
};

const cadenceReviews = {
  id: "reviews" as const,
  label: "Mark ≥5 SignalScore reviews",
};

describe("EvalView metrics containers", () => {
  it("aligns Metrics wells on EvalCard gutters", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store,
        scoreWindow,
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Labeled Eval");
    expect(html).toContain("Pilot");
    expect(html).toContain("Set Partner Baseline");
    expect(html).toContain("data-slot=\"card\"");
    expect(html).toContain("px-3 py-2.5 sm:px-4");
    expect(html).not.toContain("metric-strip");
    expect(html).not.toContain("surface-quiet");
    expect(html).not.toContain("px-1.5");
  });
});
