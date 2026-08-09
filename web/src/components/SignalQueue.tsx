"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Pager } from "@/components/Pager";
import { formatScore, primaryQuote, signalTypeLabel } from "@/lib/format";
import {
  viewHref,
  type StatusFilter,
  type TypeFilter,
} from "@/lib/views";
import type { Signal, SignalType } from "@/lib/types";
import { SignalBadge } from "./SignalBadge";

const PAGE_SIZE = 8;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "lead", label: "Lead" },
  { value: "retention", label: "Retention" },
  { value: "upsell", label: "Upsell" },
];

function isPending(signal: Signal): boolean {
  return signal.status === "new" || !signal.feedback;
}

function reviewLabel(signal: Signal): string {
  if (signal.feedback?.label) {
    return signal.feedback.label.replace("_", " ");
  }
  return signalTypeLabel(signal.type as SignalType);
}

export function SignalQueue({
  signals,
  statusFilter = "all",
  typeFilter = "all",
  page = 1,
  queryExtras,
}: {
  signals: Signal[];
  statusFilter?: StatusFilter;
  typeFilter?: TypeFilter;
  page?: number;
  /** Preserve banners / demo flags in queue URLs */
  queryExtras?: Record<string, string | undefined | null>;
}) {
  const pendingCount = useMemo(
    () => signals.filter(isPending).length,
    [signals]
  );

  const filtered = useMemo(() => {
    return signals.filter((signal) => {
      if (statusFilter === "new" && !isPending(signal)) return false;
      if (statusFilter === "reviewed" && isPending(signal)) return false;
      if (typeFilter !== "all" && signal.type !== typeFilter) return false;
      return true;
    });
  }, [signals, statusFilter, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  function queueHref(next: {
    status?: StatusFilter;
    type?: TypeFilter;
    page?: number;
  }) {
    const status = next.status ?? statusFilter;
    const type = next.type ?? typeFilter;
    const pageNum = next.page ?? 1;
    return viewHref("insights", {
      ...queryExtras,
      status,
      type: type === "all" ? null : type,
      page: pageNum > 1 ? String(pageNum) : null,
    });
  }

  if (signals.length === 0) {
    return (
      <div className="panel flex flex-col items-center justify-center px-6 py-12 text-center sm:py-16">
        <p className="text-heading-16 text-ds-gray-1000">No signals yet</p>
        <p className="mt-1 max-w-sm text-pretty text-copy-14 text-ds-gray-900">
          Upload chats or re-run detection to populate Shadow Mode.
        </p>
        <Link href={viewHref("upload")} className="btn-primary mt-4">
          Upload Chats
          <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FilterRow label="Status">
            {STATUS_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                active={statusFilter === option.value}
                href={queueHref({ status: option.value, page: 1 })}
                count={
                  option.value === "new"
                    ? pendingCount
                    : option.value === "reviewed"
                      ? signals.length - pendingCount
                      : signals.length
                }
              >
                {option.label}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Type">
            {TYPE_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                active={typeFilter === option.value}
                href={queueHref({ type: option.value, page: 1 })}
              >
                {option.label}
              </FilterChip>
            ))}
          </FilterRow>
        </div>
        <p
          className="tabular shrink-0 text-label-13 text-ds-gray-900"
          aria-live="polite"
        >
          {pendingCount > 0 ? (
            <>
              <span className="font-medium text-ds-blue-900">
                {pendingCount} pending
              </span>
              {" · "}
            </>
          ) : null}
          Showing {pageItems.length} of {filtered.length}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-12 text-center sm:py-16">
          <p className="text-heading-16 text-ds-gray-1000">
            No matching signals
          </p>
          <p className="mt-1 max-w-sm text-pretty text-copy-14 text-ds-gray-900">
            Try another filter, or clear filters to see the full queue.
          </p>
          <Link
            href={queueHref({ status: "all", type: "all", page: 1 })}
            className="btn-secondary mt-4"
          >
            Clear Filters
          </Link>
        </div>
      ) : (
        <>
          <ul className="panel divide-y divide-ds-gray-400 overflow-hidden">
            {pageItems.map((signal) => {
              const pending = isPending(signal);
              const score = formatScore(signal.score);
              const typeLabel = signalTypeLabel(signal.type);
              const statusText = pending
                ? "Pending"
                : `Reviewed · ${reviewLabel(signal)}`;
              const quote = primaryQuote(signal.evidence);

              return (
                <li key={signal.id}>
                  <Link
                    href={viewHref("insights", {
                      ...queryExtras,
                      signal: signal.id,
                    })}
                    aria-label={`${typeLabel} signal, score ${score}, ${statusText}. ${signal.summary}`}
                    className="list-row group flex items-start gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5"
                  >
                    <span className="signal-score" aria-hidden>
                      {score}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <SignalBadge type={signal.type} />
                        <span
                          className={`signal-status ${
                            pending
                              ? "signal-status-pending"
                              : "signal-status-reviewed"
                          }`}
                        >
                          <span className="signal-status-dot" aria-hidden />
                          {statusText}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-3 text-pretty text-copy-14 text-ds-gray-1000 sm:line-clamp-2">
                        {signal.summary || "No summary available"}
                      </p>
                      {quote ? (
                        <p className="mt-1 line-clamp-2 text-pretty text-label-13 text-ds-gray-900 sm:line-clamp-1">
                          “{quote}”
                        </p>
                      ) : null}
                      {signal.suggestedAction ? (
                        <p className="mt-1 line-clamp-2 text-pretty text-label-13 text-ds-gray-900 sm:line-clamp-1">
                          Next · {signal.suggestedAction}
                        </p>
                      ) : null}
                    </div>

                    <ArrowRight
                      className="mt-1.5 hidden size-4 shrink-0 text-ds-gray-700 opacity-70 transition-[color,opacity,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-ds-gray-1000 group-hover:opacity-100 group-focus-visible:translate-x-0.5 group-focus-visible:text-ds-gray-1000 group-focus-visible:opacity-100 sm:block"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          <Pager
            page={safePage}
            pageCount={pageCount}
            prevHref={
              safePage > 1 ? queueHref({ page: safePage - 1 }) : null
            }
            nextHref={
              safePage < pageCount
                ? queueHref({ page: safePage + 1 })
                : null
            }
          />
        </>
      )}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-label-12 text-ds-gray-900">{label}</span>
      <div className="flex flex-wrap gap-0.5" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  href,
  children,
  count,
}: {
  active: boolean;
  href: string;
  children: ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`filter-chip ${active ? "filter-chip-active" : "filter-chip-idle"}`}
    >
      {children}
      {typeof count === "number" ? (
        <span
          className={`tabular text-label-12 ${
            active ? "text-ds-gray-1000" : "text-ds-gray-900"
          }`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
