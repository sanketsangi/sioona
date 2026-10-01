import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  TOOLTIP_CONTENT_CLASS,
  TOOLTIP_DELAY_MS,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

describe("shared tooltip", () => {
  it("uses the quiet Ground Truth hint chrome and a first-tooltip delay", () => {
    expect(TOOLTIP_DELAY_MS).toBe(400);
    expect(TOOLTIP_CONTENT_CLASS).toContain("material-menu");
    expect(TOOLTIP_CONTENT_CLASS).toContain("rounded-[var(--radius-panel)]");
    expect(TOOLTIP_CONTENT_CLASS).toContain("bg-sio-bg-base");
    expect(TOOLTIP_CONTENT_CLASS).toContain("border-sio-border-base");
    expect(TOOLTIP_CONTENT_CLASS).toContain("text-copy-14");
    expect(TOOLTIP_CONTENT_CLASS).toContain("text-sio-fg-subtle");
    expect(TOOLTIP_CONTENT_CLASS).toContain("ring-0");
    expect(TOOLTIP_CONTENT_CLASS).toContain("zoom-in-100");
    expect(TOOLTIP_CONTENT_CLASS).toContain("motion-reduce:animate-none");
    expect(TOOLTIP_CONTENT_CLASS).not.toContain("bg-foreground");
    expect(TOOLTIP_CONTENT_CLASS).not.toContain("bg-popover");
    expect(TOOLTIP_CONTENT_CLASS).not.toContain("shadow-md");
    expect(TOOLTIP_CONTENT_CLASS).not.toContain("zoom-in-95");
  });

  it("keeps the closed trigger free of the portaled bubble", () => {
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(
          Tooltip,
          null,
          createElement(TooltipTrigger, null, "Trigger"),
          createElement(TooltipContent, { side: "bottom" }, "Gold label"),
        ),
      ),
    );

    expect(html).toContain('data-slot="tooltip-trigger"');
    expect(html).toContain("Trigger");
    expect(html).not.toContain("Gold label");
    expect(html).not.toContain("bg-foreground");
  });
});
