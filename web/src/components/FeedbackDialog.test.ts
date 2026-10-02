import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeedbackDialog } from "@/components/FeedbackDialog";
import { SidebarProvider } from "@/components/ui/sidebar";

describe("FeedbackDialog trigger", () => {
  const html = renderToStaticMarkup(
    createElement(SidebarProvider, null, createElement(FeedbackDialog)),
  );

  it("renders a labeled trigger on semantic tokens", () => {
    expect(html).toContain("Feedback");
    expect(html).toContain("border-sio-border-base");
    expect(html).toContain("bg-sio-bg-base");
    expect(html).toContain("hover:bg-sio-bg-interactive");
    expect(html).not.toContain("border-border");
    expect(html).not.toContain("bg-background");
  });

  it("keeps the 32px control height and the shared focus ring", () => {
    expect(html).toContain("h-8");
    expect(html).toContain("focus-visible:shadow-[var(--focus-ring)]");
  });

  it("does not use transition: all", () => {
    expect(html).not.toMatch(/\btransition-all\b/);
  });

  it("omits the trigger when showTrigger is false", () => {
    const bare = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(FeedbackDialog, { showTrigger: false }),
      ),
    );
    expect(bare).not.toContain("Feedback");
  });
});
