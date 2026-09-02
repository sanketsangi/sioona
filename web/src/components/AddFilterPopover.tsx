"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { LeadIcon } from "@/components/icons/LeadIcon";
import { LayersIcon } from "@/components/icons/LayersIcon";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import { XIcon } from "@/components/icons/XIcon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { StatusFilter, TypeFilter } from "@/lib/views";
import { cn } from "@/lib/utils";

export type AddFilterDimension = "keys" | "type" | "status";

export type QueueFilterHref = (next: {
  status?: StatusFilter;
  type?: TypeFilter;
  page?: number;
  preview?: string | null;
}) => string;

export const ADD_FILTER_TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "lead", label: "Lead" },
  { value: "retention", label: "Retention" },
  { value: "upsell", label: "Upsell" },
];

export const ADD_FILTER_STATUS_OPTIONS: {
  value: StatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "new", label: "Pending" },
  { value: "followup", label: "Correct" },
  { value: "acted", label: "Done" },
];

export type AddFilterListItem = {
  id: string;
  label: string;
  kind: "key" | "value";
  dimension?: "type" | "status";
  href?: string;
  active?: boolean;
  icon?: ReactNode;
};

function matchesQuery(label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return label.toLowerCase().includes(q);
}

function typeFilterIcon(
  value: TypeFilter,
  className = "size-4 shrink-0",
): ReactNode {
  switch (value) {
    case "lead":
      return <LeadIcon className={className} />;
    case "retention":
      return <RetentionIcon className={className} />;
    case "upsell":
      return <UpsellIcon className={className} />;
    default:
      return <LayersIcon className={`${className} text-sio-fg-subtle`} />;
  }
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.5 1.93933 6.03033 2.46966 10.8536 7.29289c.3905.39052.3905 1.02369 0 1.41421L6.03033 13.5303 5.5 14.0607 4.43934 13l.53033-.5303L9.43934 8 4.96967 3.53033 4.43934 3 5.5 1.93933Z"
      />
    </svg>
  );
}

/** Opening Add Filter starts on keys; an applied Type pill starts on Type values. */
export function initialAddFilterDimension(
  typeApplied: boolean,
): AddFilterDimension {
  return typeApplied ? "type" : "keys";
}

/** Searchable rows for the current Add Filter step. */
export function buildAddFilterItems({
  dimension,
  query,
  typeFilter,
  statusFilter,
  queueHref,
}: {
  dimension: AddFilterDimension;
  query: string;
  typeFilter: TypeFilter;
  statusFilter: StatusFilter;
  queueHref: QueueFilterHref;
}): AddFilterListItem[] {
  if (dimension === "keys") {
    return (
      [
        { id: "key-type", label: "Type", kind: "key" as const, dimension: "type" as const },
        {
          id: "key-status",
          label: "Status",
          kind: "key" as const,
          dimension: "status" as const,
        },
      ] satisfies AddFilterListItem[]
    ).filter((item) => matchesQuery(item.label, query));
  }

  if (dimension === "type") {
    return ADD_FILTER_TYPE_OPTIONS.filter((option) =>
      matchesQuery(option.label, query),
    ).map((option) => ({
      id: `type-${option.value}`,
      label: option.label,
      kind: "value" as const,
      href: queueHref({ type: option.value, page: 1, preview: null }),
      active: typeFilter === option.value,
      icon: typeFilterIcon(option.value),
    }));
  }

  return ADD_FILTER_STATUS_OPTIONS.filter((option) =>
    matchesQuery(option.label, query),
  ).map((option) => ({
    id: `status-${option.value}`,
    label: option.label,
    kind: "value" as const,
    href: queueHref({ status: option.value, page: 1, preview: null }),
    active: statusFilter === option.value,
  }));
}

const INPUT_CLASS =
  "h-12 min-w-0 flex-1 bg-transparent px-3 text-copy-16 text-sio-fg-base placeholder:text-sio-fg-muted !outline-none focus-visible:shadow-[var(--focus-ring)] md:h-10 md:text-label-14 filter-popover-query";

const ROW_CLASS =
  "relative flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 px-3 text-left text-label-14 text-sio-fg-base outline-none focus-visible:shadow-[var(--focus-ring)] touch-manipulation md:h-8";

export function AddFilterMenuPanel({
  query,
  onQueryChange,
  dimension,
  highlightIndex,
  onHighlightIndexChange,
  items,
  listId,
  activeOptionId,
  onClose,
  onInputKeyDown,
  onSelectKey,
  onValueNavigate,
  inputRef,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  dimension: AddFilterDimension;
  highlightIndex: number;
  onHighlightIndexChange: (index: number) => void;
  items: AddFilterListItem[];
  listId: string;
  activeOptionId: string | undefined;
  onClose: () => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSelectKey: (key: "type" | "status") => void;
  onValueNavigate: () => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const listLabel =
    dimension === "type" ? "Type" : dimension === "status" ? "Status" : "Filters";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 flex-none flex-row items-center text-label-14 md:h-10">
        <label className="flex h-12 min-w-0 flex-1 flex-row items-center md:h-10 md:min-w-[7.5rem]">
          <span className="sr-only">Filter by</span>
          <input
            ref={inputRef}
            type="text"
            name="filter"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Filter by…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            className={INPUT_CLASS}
          />
        </label>
        <button
          type="button"
          aria-label="Close"
          data-filter-popover-control="true"
          onClick={onClose}
          className="grid size-12 flex-none cursor-pointer place-content-center rounded-md text-sio-fg-base outline-none hover:bg-sio-bg-interactive focus-visible:bg-sio-bg-interactive focus-visible:shadow-[var(--focus-ring)] touch-manipulation md:hidden"
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <hr className="h-px w-full flex-none border-none bg-sio-border-base" />
      <div
        id={listId}
        role="listbox"
        aria-label={listLabel}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1 overscroll-contain [scrollbar-width:thin] md:max-h-80 md:flex-none"
      >
        {items.length === 0 ? (
          <p className="px-3 py-2 text-label-14 text-sio-fg-muted">
            No matching filters
          </p>
        ) : (
          items.map((item, index) => {
            const highlighted = index === highlightIndex;
            const optionId = `${listId}-${item.id}`;
            const row = (
              <>
                {highlighted ? (
                  <span
                    className="pointer-events-none absolute inset-x-1 inset-y-0 rounded-lg bg-sio-bg-interactive"
                    aria-hidden
                  />
                ) : null}
                {item.icon ? (
                  <span
                    className="relative flex size-4 shrink-0 items-center justify-center"
                    aria-hidden
                  >
                    {item.icon}
                  </span>
                ) : null}
                <span className="relative min-w-0 flex-1 truncate">{item.label}</span>
                {item.kind === "key" ? (
                  <ChevronRightIcon className="relative ml-auto size-4 shrink-0 text-sio-fg-subtle" />
                ) : null}
              </>
            );

            if (item.kind === "key" && item.dimension) {
              return (
                <button
                  key={item.id}
                  type="button"
                  id={optionId}
                  role="option"
                  tabIndex={-1}
                  aria-selected={highlighted}
                  className={ROW_CLASS}
                  onMouseEnter={() => onHighlightIndexChange(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectKey(item.dimension!)}
                >
                  {row}
                </button>
              );
            }

            return (
              <Link
                key={item.id}
                href={item.href ?? "#"}
                scroll={false}
                id={optionId}
                role="option"
                tabIndex={-1}
                aria-selected={highlighted}
                aria-current={item.active ? "true" : undefined}
                className={ROW_CLASS}
                onMouseEnter={() => onHighlightIndexChange(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onValueNavigate}
              >
                {row}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

export function AddFilterPopover({
  typeFilter,
  statusFilter,
  queueHref,
  typeApplied,
  children,
}: {
  typeFilter: TypeFilter;
  statusFilter: StatusFilter;
  queueHref: QueueFilterHref;
  typeApplied: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dimensionRef = useRef<AddFilterDimension>("keys");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dimension, setDimension] = useState<AddFilterDimension>("keys");
  const [highlightIndex, setHighlightIndex] = useState(0);

  dimensionRef.current = dimension;

  const items = useMemo(
    () =>
      buildAddFilterItems({
        dimension,
        query,
        typeFilter,
        statusFilter,
        queueHref,
      }),
    [dimension, query, typeFilter, statusFilter, queueHref],
  );

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, dimension]);

  const safeHighlight =
    items.length === 0 ? 0 : Math.min(highlightIndex, items.length - 1);
  const activeItem = items[safeHighlight];
  const activeOptionId = activeItem ? `${listId}-${activeItem.id}` : undefined;

  function resetClosed() {
    setQuery("");
    setDimension("keys");
    setHighlightIndex(0);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setDimension(initialAddFilterDimension(typeApplied));
      setHighlightIndex(0);
      return;
    }
    resetClosed();
  }

  function selectKey(key: "type" | "status") {
    setDimension(key);
    setQuery("");
    setHighlightIndex(0);
  }

  function activateItem(item: AddFilterListItem | undefined) {
    if (!item) return;
    if (item.kind === "key" && item.dimension) {
      selectKey(item.dimension);
      return;
    }
    if (item.href) {
      handleOpenChange(false);
      router.push(item.href, { scroll: false });
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (items.length === 0) return;
      setHighlightIndex((current) => Math.min(current + 1, items.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      setHighlightIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activateItem(items[safeHighlight]);
      return;
    }
    if (event.key === "Escape") {
      if (dimensionRef.current !== "keys") {
        event.preventDefault();
        event.stopPropagation();
        setDimension("keys");
        setQuery("");
        setHighlightIndex(0);
      }
    }
  }

  return (
    <Popover modal open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        aria-label="Add Filter"
        onOpenAutoFocus={(event) => {
          if (
            typeof window !== "undefined" &&
            window.matchMedia("(min-width: 768px)").matches
          ) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (dimensionRef.current !== "keys") {
            event.preventDefault();
            setDimension("keys");
            setQuery("");
            setHighlightIndex(0);
          }
        }}
        className={cn(
          "material-menu flex h-dvh max-h-none w-screen flex-col gap-0 overflow-hidden border border-sio-border-base bg-sio-bg-base p-0 text-sio-fg-base outline-none ring-0 overscroll-contain rounded-[var(--radius-panel)] shadow-[0_1px_1px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.04),0_12px_24px_-4px_rgba(0,0,0,0.06)]",
          "max-md:fixed max-md:inset-0 max-md:h-dvh max-md:w-screen max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:shadow-none max-md:[transform:none!important]",
          "md:h-auto md:max-h-[var(--radix-popover-content-available-height)] md:w-80",
          "motion-reduce:animate-none",
        )}
      >
        <AddFilterMenuPanel
          query={query}
          onQueryChange={setQuery}
          dimension={dimension}
          highlightIndex={safeHighlight}
          onHighlightIndexChange={setHighlightIndex}
          items={items}
          listId={listId}
          activeOptionId={activeOptionId}
          onClose={() => handleOpenChange(false)}
          onInputKeyDown={handleInputKeyDown}
          onSelectKey={selectKey}
          onValueNavigate={() => handleOpenChange(false)}
          inputRef={inputRef}
        />
      </PopoverContent>
    </Popover>
  );
}
