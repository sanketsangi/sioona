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

const PAGE_SIZE = 3;

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
  pendingSignals,
  reviewedSignals,
  queueError = null,
  statusFilter = "new",
  typeFilter = "all",
  page = 1,
  previewId = null,
  queryExtras,
}: {
  /** Neon needs-review order (joined to JSON for evidence when possible). */
  pendingSignals: Signal[];
  /** JSON signals that already have feedback. */
  reviewedSignals: Signal[];
  /** Set when FastAPI needs-review could not be loaded. */
  queueError?: string | null;
  statusFilter?: StatusFilter;
  typeFilter?: TypeFilter;
  page?: number;
  /** Inline Insights preview selection (`?preview=`). */
  previewId?: string | null;
  /** Preserve banners / demo flags in queue URLs */
  queryExtras?: Record<string, string | undefined | null>;
}) {
  const pendingCount = queueError ? 0 : pendingSignals.length;
  const reviewedCount = reviewedSignals.length;

  const filtered = useMemo(() => {
    let list: Signal[];
    if (statusFilter === "new") {
      list = queueError ? [] : pendingSignals;
    } else if (statusFilter === "reviewed") {
      list = reviewedSignals;
    } else {
      // Pending (Neon order) first, then reviewed — dedupe by id
      const pendingIds = new Set(pendingSignals.map((s) => s.id));
      const reviewedOnly = reviewedSignals.filter((s) => !pendingIds.has(s.id));
      list = queueError
        ? reviewedOnly
        : [...pendingSignals, ...reviewedOnly];
    }
    if (typeFilter === "all") return list;
    return list.filter((signal) => signal.type === typeFilter);
  }, [
    pendingSignals,
    reviewedSignals,
    queueError,
    statusFilter,
    typeFilter,
  ]);

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
    preview?: string | null;
  }) {
    const status = next.status ?? statusFilter;
    const type = next.type ?? typeFilter;
    const pageNum = next.page ?? 1;
    const preview =
      next.preview !== undefined ? next.preview : previewId;
    return viewHref("insights", {
      ...queryExtras,
      status,
      type: type === "all" ? null : type,
      page: pageNum > 1 ? String(pageNum) : null,
      preview: preview || null,
    });
  }

  const showPendingError =
    Boolean(queueError) &&
    (statusFilter === "new" || statusFilter === "all");

  if (showPendingError && statusFilter === "new") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <QueueFilters
          statusFilter={statusFilter}
          typeFilter={typeFilter}
          pendingCount={pendingCount}
          reviewedCount={reviewedCount}
          allCount={reviewedCount}
          filteredCount={0}
          pageItemCount={0}
          queueHref={queueHref}
        />
        <div
          className="panel flex flex-1 flex-col items-center justify-center px-6 py-10 text-center"
          role="alert"
        >
          <p className="text-heading-16 text-sio-fg-base">
            Pending queue unavailable
          </p>
          <p className="mt-1.5 text-copy-14 text-sio-fg-subtle">
            Signal Score backend unavailable — pending queue cannot load from
            Neon. Start FastAPI and refresh.
          </p>
          {queueError ? (
            <p className="mt-2 text-label-13 text-sio-fg-subtle">{queueError}</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (
    !queueError &&
    pendingSignals.length === 0 &&
    reviewedSignals.length === 0
  ) {
    return (
      <div className="panel flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-heading-16 text-sio-fg-base">No signals yet</p>
        <p className="mt-1.5 text-copy-14 text-sio-fg-subtle">
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <QueueFilters
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        pendingCount={pendingCount}
        reviewedCount={reviewedCount}
        allCount={
          queueError
            ? reviewedCount
            : pendingCount +
              reviewedSignals.filter(
                (s) => !pendingSignals.some((p) => p.id === s.id)
              ).length
        }
        filteredCount={filtered.length}
        pageItemCount={pageItems.length}
        queueHref={queueHref}
        pendingUnavailable={Boolean(queueError)}
      />

      {showPendingError && statusFilter === "all" ? (
        <div
          className="status-banner status-banner-warning shrink-0"
          role="alert"
        >
          <p className="text-copy-14 text-sio-fg-base">
            Neon pending queue unavailable — showing reviewed signals only.
            Start FastAPI to load needs-review.
          </p>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="panel flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <p className="text-heading-16 text-sio-fg-base">
            {statusFilter === "new"
              ? "No signals need review"
              : "No matching signals"}
          </p>
          <p className="mt-1.5 text-copy-14 text-sio-fg-subtle">
            {statusFilter === "new"
              ? "Upload chats or re-run detection to dual-write predictions to Neon."
              : "Try another filter, or clear filters to see the full queue."}
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
          <ul className="panel min-h-0 flex-1 divide-y divide-sio-border-base overflow-y-auto overflow-x-clip">
            {pageItems.map((signal) => {
              const pending = isPending(signal);
              const score = formatScore(signal.score);
              const typeLabel = signalTypeLabel(signal.type);
              const statusText = pending
                ? "Pending"
                : `Reviewed · ${reviewLabel(signal)}`;
              const selected = previewId === signal.id;

              return (
                <li key={signal.id}>
                  <Link
                    href={queueHref({ preview: signal.id, page: safePage })}
                    scroll={false}
                    aria-current={selected ? "true" : undefined}
                    aria-label={`${typeLabel} signal, score ${score}, ${statusText}. ${signal.summary}`}
                    className={`list-row group flex min-h-11 items-start gap-3 px-4 py-3 sm:min-h-[52px]`}
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
                      <p className="mt-1 line-clamp-2 text-pretty text-copy-14 text-sio-fg-base">
                        {signal.summary || "No summary available"}
                      </p>
                      {(() => {
                        const quote = primaryQuote(signal.evidence);
                        return quote ? (
                          <p className="mt-1 line-clamp-1 text-label-13 text-sio-fg-subtle">
                            “{quote}”
                          </p>
                        ) : null;
                      })()}
                      {signal.suggestedAction ? (
                        <p className="mt-1 line-clamp-1 text-label-13 text-sio-fg-subtle">
                          Next · {signal.suggestedAction}
                        </p>
                      ) : null}
                    </div>

                    <ArrowRight
                      className="mt-1.5 size-4 shrink-0 text-sio-fg-muted opacity-70 transition-[color,opacity,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-sio-fg-base group-hover:opacity-100 group-focus-visible:translate-x-0.5 group-focus-visible:text-sio-fg-base group-focus-visible:opacity-100"
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

function QueueFilters({
  statusFilter,
  typeFilter,
  pendingCount,
  reviewedCount,
  allCount,
  filteredCount,
  pageItemCount,
  queueHref,
  pendingUnavailable = false,
}: {
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  pendingCount: number;
  reviewedCount: number;
  allCount: number;
  filteredCount: number;
  pageItemCount: number;
  queueHref: (next: {
    status?: StatusFilter;
    type?: TypeFilter;
    page?: number;
    preview?: string | null;
  }) => string;
  pendingUnavailable?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <FilterRow label="Status">
          {STATUS_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              active={statusFilter === option.value}
              href={queueHref({
                status: option.value,
                page: 1,
                preview: null,
              })}
              count={
                option.value === "new"
                  ? pendingCount
                  : option.value === "reviewed"
                    ? reviewedCount
                    : allCount
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
              href={queueHref({
                type: option.value,
                page: 1,
                preview: null,
              })}
            >
              {option.label}
            </FilterChip>
          ))}
        </FilterRow>
      </div>
      <p className="tabular shrink-0 text-label-13 text-sio-fg-subtle">
        {pendingUnavailable ? (
          <>
            <span className="text-sio-status-danger-fg">Pending unavailable</span>
            {" · "}
          </>
        ) : pendingCount > 0 ? (
          <>
            <span className="text-sio-signal-lead-fg">{pendingCount} pending</span>
            {" · "}
          </>
        ) : null}
        {pageItemCount} of {filteredCount}
      </p>
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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-label-12 text-sio-fg-subtle">{label}</span>
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
            active ? "text-sio-fg-subtle" : "text-sio-fg-muted"
          }`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
