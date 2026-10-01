import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: (props: {
    href: string;
    children?: unknown;
    className?: string;
    scroll?: boolean;
    [key: string]: unknown;
  }) => {
    const { href, children, className, scroll, ...rest } = props;
    void scroll;
    return createElement("a", { href, className, ...rest }, children as never);
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import {
  AddFilterMenuPanel,
  buildAddFilterItems,
  initialAddFilterDimension,
  type QueueFilterHref,
} from "@/components/AddFilterPopover";
import type { TypeFilter } from "@/lib/views";

const queueHref: QueueFilterHref = (next) => {
  const params = new URLSearchParams({ view: "insights" });
  const status = next.status ?? "new";
  const type = next.type ?? "all";
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("type", type);
  return `/?${params.toString()}`;
};

function panel(overrides: {
  query?: string;
  dimension?: "keys" | "type";
  highlightIndex?: number;
  typeFilter?: TypeFilter;
} = {}) {
  const query = overrides.query ?? "";
  const dimension = overrides.dimension ?? "type";
  const typeFilter = overrides.typeFilter ?? "all";
  const items = buildAddFilterItems({
    dimension,
    query,
    typeFilter,
    queueHref,
  });
  return createElement(AddFilterMenuPanel, {
    query,
    onQueryChange: () => {},
    dimension,
    highlightIndex: overrides.highlightIndex ?? 0,
    onHighlightIndexChange: () => {},
    items,
    listId: "filter-list",
    activeOptionId:
      items.length > 0
        ? `filter-list-${items[overrides.highlightIndex ?? 0]?.id}`
        : undefined,
    onClose: () => {},
    onInputKeyDown: () => {},
    onSelectKey: () => {},
    onValueNavigate: () => {},
  });
}

describe("buildAddFilterItems", () => {
  it("lists Type as the only key; Status stays on the queue pills", () => {
    const keys = buildAddFilterItems({
      dimension: "keys",
      query: "",
      typeFilter: "all",
      queueHref,
    });
    expect(keys.map((item) => item.label)).toEqual(["Type"]);
    expect(keys.every((item) => item.kind === "key")).toBe(true);
    expect(keys.some((item) => item.label === "Status")).toBe(false);

    const typed = buildAddFilterItems({
      dimension: "keys",
      query: "ty",
      typeFilter: "all",
      queueHref,
    });
    expect(typed.map((item) => item.label)).toEqual(["Type"]);

    const statusQuery = buildAddFilterItems({
      dimension: "keys",
      query: "status",
      typeFilter: "all",
      queueHref,
    });
    expect(statusQuery).toEqual([]);
  });

  it("lists Type values with icons and hrefs, without key chevrons", () => {
    const items = buildAddFilterItems({
      dimension: "type",
      query: "",
      typeFilter: "lead",
      queueHref,
    });
    expect(items.map((item) => item.label)).toEqual([
      "All Types",
      "Lead",
      "Retention",
      "Upsell",
    ]);
    expect(items.every((item) => item.kind === "value")).toBe(true);
    const lead = items.find((item) => item.label === "Lead");
    expect(lead?.href).toContain("type=lead");
    expect(lead?.active).toBe(true);
    expect(lead?.icon).toBeTruthy();
  });

  it("opens on Type values because Status is already on the pills", () => {
    expect(initialAddFilterDimension(false)).toBe("type");
    expect(initialAddFilterDimension(true)).toBe("type");
  });
});

describe("AddFilterMenuPanel", () => {
  it("renders Geist search chrome, Close on mobile, and Type values without Status", () => {
    const html = renderToStaticMarkup(panel());

    expect(html).toContain('placeholder="Filter by…"');
    expect(html).toContain("text-label-14");
    expect(html).not.toContain("text-copy-16");
    expect(html).toContain("filter-popover-query");
    expect(html).toContain("appearance-none");
    expect(html).toContain("focus-visible:shadow-none");
    expect(html).toContain("md:min-w-[7.5rem]");
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain('data-filter-popover-control="true"');
    expect(html).toContain("md:hidden");
    expect(html).toContain("role=\"combobox\"");
    expect(html).toContain("role=\"listbox\"");
    expect(html).toContain("aria-activedescendant");
    expect(html).toContain("All Types");
    expect(html).toContain("Lead");
    expect(html).not.toContain(">Status</span>");
    expect(html).not.toContain("key-status");
    expect(html).toContain("overscroll-contain");
    expect(html).toContain("h-8");
    expect(html).not.toContain("h-11");
    expect(html).toContain("inset-x-1");
    expect(html).toContain("bg-sio-bg-interactive");
    expect(html).not.toContain("<hr");
    expect(html).not.toContain("bg-sio-border-base");
  });

  it("renders Type values as links with type icons and no chevrons", () => {
    const html = renderToStaticMarkup(
      panel({ dimension: "type", typeFilter: "lead" }),
    );

    expect(html).toContain("All Types");
    expect(html).toContain("Lead");
    expect(html).toContain("Retention");
    expect(html).toContain("Upsell");
    expect(html).toContain("type=lead");
    expect(html).toContain('aria-current="true"');
    expect(html).not.toContain(">Type</span>");
    expect(html).not.toContain(">Status</span>");
    expect(html).not.toContain("10.8536");
  });

  it("shows an empty helper when search matches nothing", () => {
    const html = renderToStaticMarkup(
      panel({ dimension: "keys", query: "zzz" }),
    );
    expect(html).toContain("No matching filters");
    expect(html).not.toContain(">Type</span>");
    expect(html).not.toContain(">Status</span>");
  });
});
