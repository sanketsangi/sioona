import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    scroll: _scroll,
    ...rest
  }: {
    href: string;
    children?: unknown;
    className?: string;
    scroll?: boolean;
    [key: string]: unknown;
  }) => createElement("a", { href, className, ...rest }, children as never),
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
import type { StatusFilter, TypeFilter } from "@/lib/views";

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
  dimension?: "keys" | "type" | "status";
  highlightIndex?: number;
  typeFilter?: TypeFilter;
  statusFilter?: StatusFilter;
} = {}) {
  const query = overrides.query ?? "";
  const dimension = overrides.dimension ?? "keys";
  const typeFilter = overrides.typeFilter ?? "all";
  const statusFilter = overrides.statusFilter ?? "new";
  const items = buildAddFilterItems({
    dimension,
    query,
    typeFilter,
    statusFilter,
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
  it("lists Type and Status keys, filtered by query", () => {
    const keys = buildAddFilterItems({
      dimension: "keys",
      query: "",
      typeFilter: "all",
      statusFilter: "new",
      queueHref,
    });
    expect(keys.map((item) => item.label)).toEqual(["Type", "Status"]);
    expect(keys.every((item) => item.kind === "key")).toBe(true);

    const typed = buildAddFilterItems({
      dimension: "keys",
      query: "ty",
      typeFilter: "all",
      statusFilter: "new",
      queueHref,
    });
    expect(typed.map((item) => item.label)).toEqual(["Type"]);
  });

  it("lists Type values with icons and hrefs, without key chevrons", () => {
    const items = buildAddFilterItems({
      dimension: "type",
      query: "",
      typeFilter: "lead",
      statusFilter: "new",
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

  it("lists Status values as links while leaving chips as the URL SoT", () => {
    const items = buildAddFilterItems({
      dimension: "status",
      query: "pend",
      typeFilter: "all",
      statusFilter: "new",
      queueHref,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Pending");
    expect(items[0]?.href).toContain("status=new");
    expect(items[0]?.active).toBe(true);
  });

  it("opens on Type values when Type is already applied", () => {
    expect(initialAddFilterDimension(false)).toBe("keys");
    expect(initialAddFilterDimension(true)).toBe("type");
  });
});

describe("AddFilterMenuPanel", () => {
  it("renders Geist search chrome, Close on mobile, and key rows with chevrons", () => {
    const html = renderToStaticMarkup(panel());

    expect(html).toContain('placeholder="Filter by…"');
    expect(html).toContain("text-copy-16");
    expect(html).toContain("md:text-label-14");
    expect(html).toContain("filter-popover-query");
    expect(html).toContain("md:min-w-[7.5rem]");
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain('data-filter-popover-control="true"');
    expect(html).toContain("md:hidden");
    expect(html).toContain("role=\"combobox\"");
    expect(html).toContain("role=\"listbox\"");
    expect(html).toContain("aria-activedescendant");
    expect(html).toContain(">Type</span>");
    expect(html).toContain(">Status</span>");
    expect(html).toContain("overscroll-contain");
    expect(html).toContain("h-11");
    expect(html).toContain("md:h-8");
    expect(html).toContain("inset-x-1");
    expect(html).toContain("bg-sio-bg-interactive");
    expect(html).toContain("bg-sio-border-base");
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
  });
});
