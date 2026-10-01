import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { GEIST_MASK_SVG } from "@/components/icons/geist-mask-svg";
import {
  GROUND_TRUTH_DETECTED_PILL_CLASS,
  GROUND_TRUTH_MENU_CLASS,
  GROUND_TRUTH_OPTIONS,
  GROUND_TRUTH_ROLE_LABEL,
  GROUND_TRUTH_ROLE_POPOVER_CLASS,
  GroundTruthControl,
  GroundTruthRoleLabel,
  GroundTruthSaveError,
  groundTruthOptionRowClass,
  groundTruthSaveErrorMessage,
  isGroundTruthSuggestedOption,
  type GroundTruthValue,
} from "@/components/GroundTruthControl";

function optionIconHtml(value: GroundTruthValue): string {
  const option = GROUND_TRUTH_OPTIONS.find((item) => item.value === value);
  if (!option) throw new Error(`missing ground truth option ${value}`);
  return renderToStaticMarkup(createElement(option.Icon, { className: "size-4" }));
}

const UNSET_SLASH_PATH = "M15.591%201.59099";
const NONE_OCTAGON_PATH = "M5.30761%201.5";
const LEAD_PERSON_PATH = "M7.75%200C5.95507";
const RETENTION_SHIELD_PATH = "M3.5%204.057";
const UPSELL_PATH = "M10.8242%203H10.0742";

describe("isGroundTruthSuggestedOption", () => {
  it("highlights only the detected signal type", () => {
    expect(isGroundTruthSuggestedOption("retention", "retention")).toBe(true);
    expect(isGroundTruthSuggestedOption("lead", "retention")).toBe(false);
    expect(isGroundTruthSuggestedOption("", "retention")).toBe(false);
    expect(isGroundTruthSuggestedOption("none", "retention")).toBe(false);
    expect(isGroundTruthSuggestedOption("retention", undefined)).toBe(false);
  });
});

describe("groundTruthOptionRowClass", () => {
  it("matches Add Filter rows without signal colors", () => {
    for (const value of ["", "lead", "retention", "upsell", "none"] as const) {
      const row = groundTruthOptionRowClass(value, false);
      expect(row).toContain("text-sio-fg-base");
      expect(row).toContain("text-label-14");
      expect(row).toContain("h-8");
      expect(row).not.toContain("h-11");
      expect(row).toContain("px-3");
      expect(row).toContain("gap-2");
      expect(row).toContain("touch-manipulation");
      expect(row).toContain("before:bg-sio-bg-interactive");
      expect(row).toContain("before:inset-x-1");
      expect(row).toContain("before:rounded-lg");
      expect(row).toContain("data-[highlighted]:before:opacity-100");
      expect(row).toContain("focus:before:opacity-100");
      expect(row).not.toContain("text-sio-fg-muted");
      expect(row).not.toContain("sio-signal-");
      expect(row).not.toContain("focus:bg-accent");
    }
  });

  it("keeps the hover wash on the detected signal at rest", () => {
    const suggested = groundTruthOptionRowClass("retention", true);
    const plain = groundTruthOptionRowClass("lead", false);

    expect(suggested).toContain("text-sio-fg-base");
    expect(suggested).toContain("text-label-14");
    expect(suggested).toContain("before:bg-sio-bg-interactive");
    expect(suggested).toMatch(/(?:^|\s)before:opacity-100(?:\s|$)/);
    expect(suggested).not.toMatch(/(?:^|\s)before:opacity-0(?:\s|$)/);
    expect(plain).toMatch(/(?:^|\s)before:opacity-0(?:\s|$)/);
    expect(plain).not.toMatch(/(?:^|\s)before:opacity-100(?:\s|$)/);
    expect(suggested).not.toContain("bg-sio-bg-muted");
    expect(suggested).not.toContain("font-medium");
    expect(suggested).not.toContain("sio-signal-");
    expect(suggested).not.toContain("ring-1");
  });

  it("drops the detected wash while another row is being browsed", () => {
    const suppressed = groundTruthOptionRowClass("retention", true, true);
    expect(suppressed).toMatch(/(?:^|\s)before:opacity-0(?:\s|$)/);
    expect(suppressed).not.toMatch(/(?:^|\s)before:opacity-100(?:\s|$)/);
    expect(suppressed).toContain("data-[highlighted]:before:opacity-100");
  });

  it("hides the radio check without leaving a gap", () => {
    for (const suggested of [false, true]) {
      const row = groundTruthOptionRowClass("retention", suggested);
      expect(row).toContain(
        "[&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden",
      );
      expect(row).not.toContain(
        "[&_[data-slot=dropdown-menu-radio-item-indicator]]:relative",
      );
      expect(row).not.toContain("order-last");
      expect(row).not.toContain(
        "[&_[data-slot=dropdown-menu-radio-item-indicator]]:size-4",
      );
      expect(row).not.toContain("pr-8");
    }
  });
});

describe("GROUND_TRUTH_DETECTED_PILL_CLASS", () => {
  it("styles Detected as a quiet full-radius chip", () => {
    expect(GROUND_TRUTH_DETECTED_PILL_CLASS).toContain("rounded-full");
    expect(GROUND_TRUTH_DETECTED_PILL_CLASS).toContain("bg-sio-bg-base");
    expect(GROUND_TRUTH_DETECTED_PILL_CLASS).toContain("px-2");
    expect(GROUND_TRUTH_DETECTED_PILL_CLASS).toContain("text-label-12");
    expect(GROUND_TRUTH_DETECTED_PILL_CLASS).toContain("text-sio-fg-muted");
    expect(GROUND_TRUTH_DETECTED_PILL_CLASS).not.toContain("sio-signal-");
    expect(GROUND_TRUTH_DETECTED_PILL_CLASS).not.toContain("rounded-md");
  });
});

describe("GroundTruthControl", () => {
  it("renders a FilterPill trigger with visible Ground Truth label", () => {
    const html = renderToStaticMarkup(
      createElement(GroundTruthControl, {
        conversationId: "conv_1",
        defaultType: "retention",
      }),
    );

    expect(html).toContain('aria-label="Ground Truth, Unset"');
    expect(html).toContain("Ground Truth");
    expect(html).toContain("Unset");
    expect(html).toContain('data-pill-background="true"');
    expect(html).toContain("rounded-full");
    expect(html).not.toContain("rounded-[10ex]");
    expect(html).toContain("border-sio-border-subtle");
    expect(html).toContain("hover:bg-sio-bg-interactive");
    expect(html).toContain("hover:border-sio-border-strong");
    expect(html).toContain("text-sio-fg-base");
    expect(html).toContain("text-sio-fg-muted");
    expect(html).toContain(
      "relative flex h-8 flex-row items-center gap-1.5 px-3 text-label-14",
    );
    expect(html).toContain('data-slot="tooltip-trigger"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-slot="card"');
    expect(html).not.toContain('data-slot="toggle-group"');
    expect(html).toContain('data-slot="tooltip-trigger"');
    expect(html).not.toContain('data-slot="popover-anchor"');
    expect(html).not.toContain(GROUND_TRUTH_ROLE_LABEL);
    expect(html).not.toContain("Optional Eval gold label");
    expect(html).not.toContain("Saving…");
    expect(html).not.toContain('role="alert"');
    // Closed trigger stays FilterPill chrome — no signal tint on the pill itself
    expect(html).not.toContain("bg-sio-signal-lead-bg");
    expect(html).not.toContain("bg-sio-signal-retention-bg");
    expect(html).not.toContain("bg-sio-signal-upsell-bg");
    expect(html).toContain(UNSET_SLASH_PATH);
    expect(html).toContain(encodeURIComponent('viewBox="0 0 17 17"'));
    expect(html).toContain(encodeURIComponent('width="16"'));
  });

  it("shows the lead signal icon beside the value, after the Ground Truth label", () => {
    const html = renderToStaticMarkup(
      createElement(GroundTruthControl, {
        conversationId: "conv_1",
        groundTruth: "lead",
        defaultType: "retention",
      }),
    );

    const labelAt = html.indexOf(">Ground Truth<");
    const iconAt = html.indexOf(LEAD_PERSON_PATH);
    const valueAt = html.indexOf(">Lead<");

    expect(html).toContain('aria-label="Ground Truth, Lead"');
    expect(html).toContain('data-pill-background="true"');
    expect(html).toContain("rounded-full");
    expect(html).toContain("hover:bg-sio-bg-interactive");
    expect(html).toContain(">Ground Truth</span>");
    expect(html).toContain('class="shrink-0 font-normal text-sio-fg-base"');
    expect(html).toContain('class="min-w-0 truncate text-sio-fg-muted"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("[mask-image:var(--geist-icon)]");
    expect(html).toContain("size-4");
    expect(labelAt).toBeGreaterThan(-1);
    expect(iconAt).toBeGreaterThan(labelAt);
    expect(valueAt).toBeGreaterThan(iconAt);
    expect(html).not.toContain("bg-sio-bg-base [outline-style:solid] outline-sio-border-base");
    expect(html).not.toContain("bg-sio-signal-lead-bg");
  });

  it("shows the retention shield beside the value on the closed trigger", () => {
    const html = renderToStaticMarkup(
      createElement(GroundTruthControl, {
        conversationId: "conv_1",
        groundTruth: "retention",
      }),
    );

    const labelAt = html.indexOf(">Ground Truth<");
    const iconAt = html.indexOf(RETENTION_SHIELD_PATH);
    const valueAt = html.indexOf(">Retention<");

    expect(html).toContain('aria-label="Ground Truth, Retention"');
    expect(iconAt).toBeGreaterThan(labelAt);
    expect(valueAt).toBeGreaterThan(iconAt);
    expect(html).not.toContain(LEAD_PERSON_PATH);
  });

  it("shows the octagon beside None and the slashed circle beside Unset", () => {
    const none = renderToStaticMarkup(
      createElement(GroundTruthControl, {
        conversationId: "conv_1",
        groundTruth: "none",
      }),
    );
    const unset = renderToStaticMarkup(
      createElement(GroundTruthControl, {
        conversationId: "conv_1",
      }),
    );

    expect(none.indexOf(NONE_OCTAGON_PATH)).toBeGreaterThan(
      none.indexOf(">Ground Truth<"),
    );
    expect(none.indexOf(">None<")).toBeGreaterThan(none.indexOf(NONE_OCTAGON_PATH));
    expect(unset.indexOf(UNSET_SLASH_PATH)).toBeGreaterThan(
      unset.indexOf(">Ground Truth<"),
    );
    expect(unset.indexOf(">Unset<")).toBeGreaterThan(
      unset.indexOf(UNSET_SLASH_PATH),
    );
  });
});

describe("ground truth option icons", () => {
  it("uses the slashed circle for Unset and the outline octagon for None", () => {
    const unset = optionIconHtml("");
    const none = optionIconHtml("none");

    expect(unset).toContain(UNSET_SLASH_PATH);
    expect(unset).toContain(
      encodeURIComponent(GEIST_MASK_SVG["/icons/circle-slash.svg"]),
    );
    expect(unset).toContain(encodeURIComponent('viewBox="0 0 17 17"'));
    expect(unset).toContain(encodeURIComponent('width="16"'));
    expect(unset).toContain("bg-current");
    expect(unset).not.toContain("%23666666");

    expect(none).toContain(NONE_OCTAGON_PATH);
    expect(none).toContain(
      encodeURIComponent(GEIST_MASK_SVG["/icons/octagon-alert.svg"]),
    );
    expect(none).toContain("bg-current");
    expect(none).not.toContain("%23d8001b");
    expect(none).not.toContain(LEAD_PERSON_PATH);
    expect(unset).not.toContain(NONE_OCTAGON_PATH);
  });

  it("keeps Lead, Retention, and Upsell glyphs", () => {
    expect(optionIconHtml("lead")).toContain(LEAD_PERSON_PATH);
    expect(optionIconHtml("retention")).toContain(RETENTION_SHIELD_PATH);
    expect(optionIconHtml("upsell")).toContain(UPSELL_PATH);
    expect(optionIconHtml("lead")).not.toContain(NONE_OCTAGON_PATH);
    expect(optionIconHtml("retention")).not.toContain(UNSET_SLASH_PATH);
    expect(optionIconHtml("upsell")).not.toContain(UNSET_SLASH_PATH);
  });
});

describe("GROUND_TRUTH_MENU_CLASS", () => {
  it("uses the Add Filter menu shell", () => {
    expect(GROUND_TRUTH_MENU_CLASS).toContain("material-menu");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("rounded-[var(--radius-panel)]");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("bg-sio-bg-base");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("border-sio-border-base");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("p-0");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("ring-0");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("w-56");
    expect(GROUND_TRUTH_MENU_CLASS).toContain("max-w-[calc(100vw-1.5rem)]");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("md:w-80");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("w-screen");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("max-md:w-screen");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("max-md:max-w-none");
    expect(GROUND_TRUTH_MENU_CLASS).toContain(
      "shadow-[0_1px_1px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.04),0_12px_24px_-4px_rgba(0,0,0,0.06)]",
    );
    expect(GROUND_TRUTH_MENU_CLASS).toContain("motion-reduce:animate-none");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("shadow-md");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("bg-popover");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("h-dvh");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("max-md:fixed");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("max-md:inset-0");
    expect(GROUND_TRUTH_MENU_CLASS).not.toContain("max-md:rounded-none");
  });
});

describe("GroundTruthRoleLabel", () => {
  it("states the gold label for the Labeled panel and that the week score is unchanged", () => {
    expect(GROUND_TRUTH_ROLE_LABEL).toBe(
      "Gold label for the Labeled panel. Does not change this week’s score.",
    );

    const html = renderToStaticMarkup(
      createElement(GroundTruthRoleLabel, { id: "gt-role" }),
    );

    expect(html).toContain(`id="gt-role"`);
    expect(html).toContain(GROUND_TRUTH_ROLE_LABEL);
    expect(html).toContain("text-copy-14");
    expect(html).toContain("text-sio-fg-subtle");
    expect(html).not.toContain("text-label-12");
    expect(html).not.toContain("text-right");
    expect(html).not.toContain("border");
    expect(html).not.toContain("bg-sio-");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("material-menu");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("rounded-[var(--radius-panel)]");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("bg-sio-bg-base");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("border-sio-border-base");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("ring-0");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).toContain("motion-reduce:animate-none");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).not.toContain("bg-popover");
    expect(GROUND_TRUTH_ROLE_POPOVER_CLASS).not.toContain("shadow-md");
    expect(html).not.toContain("sr-only");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("bg-sio-bg-inverse");
    expect(html).not.toContain("text-sio-fg-on-color");
  });
});

describe("GroundTruthSaveError", () => {
  it("shows a visible danger alert for sighted and touch users", () => {
    const message = groundTruthSaveErrorMessage("Failed to save ground truth");
    expect(message).toBe(
      "Failed to save ground truth. Try again or refresh the page.",
    );

    const html = renderToStaticMarkup(
      createElement(GroundTruthSaveError, {
        error: "Failed to save ground truth",
      }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain(message);
    expect(html).toContain("text-sio-status-danger-fg");
    expect(html).not.toContain("sr-only");
  });
});
