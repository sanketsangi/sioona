import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

import {
  EXPORT_EVAL_EMPTY_BODY,
  EXPORT_EVAL_EMPTY_TITLE,
  ExportEvalEmptyState,
} from "./ExportEvalPanel";

describe("ExportEvalEmptyState", () => {
  it("shows a human empty state without paths or CLI in prod-shaped render", () => {
    const html = renderToStaticMarkup(
      createElement(ExportEvalEmptyState, {
        error: {
          ok: false,
          code: "missing_file",
          message: "Week-2 export isn’t ready yet.",
          debugMessage:
            "Missing week-2 partner export at /var/task/web/data/samples/real-partner-export.week2.local.csv",
        },
      }),
    );

    expect(html).toContain(EXPORT_EVAL_EMPTY_TITLE);
    expect(html).toContain(EXPORT_EVAL_EMPTY_BODY);
    expect(html).toContain("Upload export");
    expect(html).toContain("view=upload");
    expect(html).toContain("Back to Metrics");
    expect(html).toContain("panel=metrics");
    expect(html).toContain("measurement only");
    expect(html).not.toContain("/var/task");
    expect(html).not.toContain("npm run");
    expect(html).not.toContain("eval:partner-export");
    expect(html).not.toContain("Technical details");
    expect(html).not.toContain("real-partner-export.week2.local.csv");
    expect(html).not.toContain("web/data/samples");
  });
});
