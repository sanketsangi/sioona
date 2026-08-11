"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { FilterIcon } from "@/components/icons/FilterIcon";
import { Pager } from "@/components/Pager";
import {
  Menu,
  MenuButton,
  MenuContainer,
  MenuDivider,
  MenuItem,
  MenuSection,
} from "@/components/ui/Menu";
import {
  formatScore,
  primaryQuote,
  signalTypeInitial,
  signalTypeLabel,
  signalTypeMarkClass,
} from "@/lib/format";
import { viewHref, type StatusFilter, type TypeFilter } from "@/lib/views";
import type { Signal, SignalType } from "@/lib/types";

const PAGE_SIZE = 5;

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

type QueueHref = (next: {
  status?: StatusFilter;
  type?: TypeFilter;
  page?: number;
  preview?: string | null;
}) => string;

type SignalQueueProps = {
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
  /** When false, filters are rendered by the parent (e.g. Insights header). */
  showFilters?: boolean;
};

function buildQueueHref(
  queryExtras: Record<string, string | undefined | null> | undefined,
  statusFilter: StatusFilter,
  typeFilter: TypeFilter,
  previewId: string | null | undefined,
): QueueHref {
  return (next) => {
    const status = next.status ?? statusFilter;
    const type = next.type ?? typeFilter;
    const pageNum = next.page ?? 1;
    const preview = next.preview !== undefined ? next.preview : previewId;
    return viewHref("insights", {
      ...queryExtras,
      status,
      type: type === "all" ? null : type,
      page: pageNum > 1 ? String(pageNum) : null,
      preview: preview || null,
    });
  };
}

/** Detail URL preserves queue filters + preview so Back can restore them. */
function buildDetailHref(
  signalId: string,
  queryExtras: Record<string, string | undefined | null> | undefined,
  statusFilter: StatusFilter,
  typeFilter: TypeFilter,
  page: number,
  previewId?: string | null,
): string {
  return viewHref("insights", {
    ...queryExtras,
    signal: signalId,
    status: statusFilter,
    type: typeFilter === "all" ? null : typeFilter,
    page: page > 1 ? String(page) : null,
    preview: previewId || null,
  });
}

function useQueueList({
  pendingSignals,
  reviewedSignals,
  queueError,
  statusFilter,
  typeFilter,
}: {
  pendingSignals: Signal[];
  reviewedSignals: Signal[];
  queueError?: string | null;
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
}) {
  const pendingCount = queueError ? 0 : pendingSignals.length;
  const reviewedCount = reviewedSignals.length;
  const allCount = queueError
    ? reviewedCount
    : pendingCount +
      reviewedSignals.filter((s) => !pendingSignals.some((p) => p.id === s.id))
        .length;

  const filtered = useMemo(() => {
    let list: Signal[];
    if (statusFilter === "new") {
      list = queueError ? [] : pendingSignals;
    } else if (statusFilter === "reviewed") {
      list = reviewedSignals;
    } else {
      const pendingIds = new Set(pendingSignals.map((s) => s.id));
      const reviewedOnly = reviewedSignals.filter((s) => !pendingIds.has(s.id));
      list = queueError ? reviewedOnly : [...pendingSignals, ...reviewedOnly];
    }
    if (typeFilter === "all") return list;
    return list.filter((signal) => signal.type === typeFilter);
  }, [pendingSignals, reviewedSignals, queueError, statusFilter, typeFilter]);

  return { pendingCount, reviewedCount, allCount, filtered };
}

/** Filters + count summary for Insights header (right of section title). */
export function SignalQueueFilters({
  pendingSignals,
  reviewedSignals,
  queueError = null,
  statusFilter = "new",
  typeFilter = "all",
  page = 1,
  previewId = null,
  queryExtras,
}: Omit<SignalQueueProps, "showFilters">) {
  const { pendingCount, reviewedCount, allCount, filtered } = useQueueList({
    pendingSignals,
    reviewedSignals,
    queueError,
    statusFilter,
    typeFilter,
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItemCount =
    statusFilter === "new" && queueError
      ? 0
      : filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE).length;
  const queueHref = buildQueueHref(
    queryExtras,
    statusFilter,
    typeFilter,
    previewId,
  );

  return (
    <QueueFilters
      statusFilter={statusFilter}
      typeFilter={typeFilter}
      pendingCount={pendingCount}
      reviewedCount={reviewedCount}
      allCount={statusFilter === "new" && queueError ? reviewedCount : allCount}
      filteredCount={statusFilter === "new" && queueError ? 0 : filtered.length}
      pageItemCount={pageItemCount}
      queueHref={queueHref}
      pendingUnavailable={Boolean(queueError)}
    />
  );
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
  showFilters = true,
}: SignalQueueProps) {
  const { pendingCount, reviewedCount, allCount, filtered } = useQueueList({
    pendingSignals,
    reviewedSignals,
    queueError,
    statusFilter,
    typeFilter,
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const queueHref = buildQueueHref(
    queryExtras,
    statusFilter,
    typeFilter,
    previewId,
  );

  const showPendingError =
    Boolean(queueError) && (statusFilter === "new" || statusFilter === "all");

  if (showPendingError && statusFilter === "new") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {showFilters ? (
          <QueueFilters
            statusFilter={statusFilter}
            typeFilter={typeFilter}
            pendingCount={pendingCount}
            reviewedCount={reviewedCount}
            allCount={reviewedCount}
            filteredCount={0}
            pageItemCount={0}
            queueHref={queueHref}
            pendingUnavailable
          />
        ) : null}
        <div
          className="panel flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-10"
          role="alert"
        >
          <p className="text-heading-16 text-sio-fg-base">
            Pending Queue Unavailable
          </p>
          <p className="mt-1.5 max-w-sm text-pretty text-copy-14 text-sio-fg-subtle">
            Signal Score backend unavailable — pending queue cannot load from
            Neon. Start FastAPI and refresh.
          </p>
          {queueError ? (
            <p className="mt-2 max-w-sm break-words text-label-13 text-sio-fg-muted">
              {queueError}
            </p>
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
      <div className="panel flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-10">
        <p className="text-heading-16 text-sio-fg-base">No Signals Yet</p>
        <p className="mt-1.5 max-w-sm text-pretty text-copy-14 text-sio-fg-subtle">
          Upload chats or re-run detection to populate Shadow Mode.
        </p>
        <Link href={viewHref("upload")} className="btn-primary mt-4">
          Upload Chats
          <ArrowRight className="size-3.5" weight="bold" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showFilters ? (
        <QueueFilters
          statusFilter={statusFilter}
          typeFilter={typeFilter}
          pendingCount={pendingCount}
          reviewedCount={reviewedCount}
          allCount={allCount}
          filteredCount={filtered.length}
          pageItemCount={pageItems.length}
          queueHref={queueHref}
          pendingUnavailable={Boolean(queueError)}
        />
      ) : null}

      {showPendingError && statusFilter === "all" ? (
        <div
          className="status-banner status-banner-warning shrink-0"
          role="alert"
        >
          <p className="text-copy-14 text-sio-fg-base">
            Neon pending queue unavailable
          </p>
          <p className="mt-0.5 text-pretty text-label-13 text-sio-fg-subtle">
            Showing reviewed signals only. Start FastAPI to load needs-review.
          </p>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="panel flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-10">
          <p className="text-heading-16 text-sio-fg-base">
            {statusFilter === "new"
              ? "No Signals Need Review"
              : "No Matching Signals"}
          </p>
          <p className="mt-1.5 max-w-sm text-pretty text-copy-14 text-sio-fg-subtle">
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className="mb-2 hidden shrink-0 px-1 sm:flex sm:items-center sm:gap-4 sm:px-4"
              aria-hidden
            >
              <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1.4fr)_4.5rem_5.5rem_minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.4fr)_4.5rem_5.5rem_minmax(0,1.2fr)]">
                <span className="text-label-12 text-sio-fg-muted">Signal</span>
                <span className="text-label-12 text-sio-fg-muted">Score</span>
                <span className="text-label-12 text-sio-fg-muted">Type</span>
                <span className="text-label-12 text-sio-fg-muted">
                  Evidence
                </span>
              </div>
              <span className="w-[4.75rem] shrink-0 text-right text-label-12 text-sio-fg-muted">
                Action
              </span>
            </div>

            <ul className="scroll-region flex min-h-0 flex-1 flex-col gap-2.5 sm:gap-3">
              {pageItems.map((signal) => {
                const pending = isPending(signal);
                const score = formatScore(signal.score);
                const typeLabel = signalTypeLabel(signal.type);
                const statusText = pending
                  ? "Pending"
                  : `Reviewed · ${reviewLabel(signal)}`;
                const selected = previewId === signal.id;
                const quote = primaryQuote(signal.evidence);
                const evidencePrimary = quote
                  ? `“${quote}”`
                  : signal.suggestedAction || "—";
                const evidenceSub = quote
                  ? signal.suggestedAction
                    ? `Next · ${signal.suggestedAction}`
                    : "Evidence"
                  : signal.suggestedAction
                    ? "Suggested action"
                    : "No evidence quote";
                const previewHref = queueHref({
                  preview: signal.id,
                  page: safePage,
                });
                const detailHref = buildDetailHref(
                  signal.id,
                  queryExtras,
                  statusFilter,
                  typeFilter,
                  safePage,
                  previewId,
                );

                return (
                  <li key={signal.id} className="shrink-0">
                    <div
                      className={`panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-3.5 ${
                        selected
                          ? "bg-sio-bg-interactive ring-1 ring-inset ring-sio-border-strong"
                          : ""
                      }`}
                    >
                      <Link
                        href={previewHref}
                        scroll={false}
                        aria-current={selected ? "true" : undefined}
                        aria-label={`${typeLabel} signal, score ${score}, ${statusText}. Preview ${signal.summary || "signal"}`}
                        className="grid min-w-0 flex-1 grid-cols-1 gap-3 rounded-sm touch-manipulation outline-none transition-[opacity] duration-150 focus-visible:shadow-[0_0_0_2px_var(--sio-bg-base),0_0_0_4px_var(--sio-focus-accent)] sm:grid-cols-[minmax(0,1.4fr)_4.5rem_5.5rem_minmax(0,1fr)] sm:items-center sm:gap-4 lg:grid-cols-[minmax(0,1.4fr)_4.5rem_5.5rem_minmax(0,1.2fr)]"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`flex size-9 shrink-0 items-center justify-center rounded-sm text-label-14 font-semibold ${signalTypeMarkClass(signal.type)}`}
                            aria-hidden
                          >
                            {signalTypeInitial(signal.type)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-copy-14 font-semibold text-sio-fg-base">
                              {signal.summary || "No summary available"}
                            </p>
                            <span
                              className={`signal-status mt-1 min-w-0 ${
                                pending
                                  ? "signal-status-pending"
                                  : "signal-status-reviewed"
                              }`}
                            >
                              <span className="signal-status-dot" aria-hidden />
                              <span className="truncate">{statusText}</span>
                            </span>

                            <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 sm:hidden">
                              <div className="min-w-0">
                                <dt className="text-label-12 text-sio-fg-muted">
                                  Score
                                </dt>
                                <dd className="tabular text-copy-14 font-semibold text-sio-fg-base">
                                  {score}
                                </dd>
                              </div>
                              <div className="min-w-0">
                                <dt className="text-label-12 text-sio-fg-muted">
                                  Type
                                </dt>
                                <dd className="truncate text-copy-14 font-semibold text-sio-fg-base">
                                  {typeLabel}
                                </dd>
                              </div>
                              <div className="col-span-2 min-w-0">
                                <dt className="text-label-12 text-sio-fg-muted">
                                  Evidence
                                </dt>
                                <dd className="truncate text-copy-14 text-sio-fg-subtle">
                                  {evidencePrimary}
                                </dd>
                                {quote && signal.suggestedAction ? (
                                  <dd className="mt-0.5 truncate text-label-12 text-sio-fg-muted">
                                    Next · {signal.suggestedAction}
                                  </dd>
                                ) : null}
                              </div>
                            </dl>
                          </div>
                        </div>

                        <div className="hidden min-w-0 sm:block">
                          <p className="tabular text-copy-14 font-semibold text-sio-fg-base">
                            {score}
                          </p>
                          <p className="mt-0.5 text-label-12 text-sio-fg-muted">
                            Score
                          </p>
                        </div>

                        <div className="hidden min-w-0 sm:block">
                          <p className="truncate text-copy-14 font-semibold text-sio-fg-base">
                            {typeLabel}
                          </p>
                          <p className="mt-0.5 text-label-12 text-sio-fg-muted">
                            Type
                          </p>
                        </div>

                        <div className="hidden min-w-0 sm:block">
                          <p className="truncate text-copy-14 text-sio-fg-base">
                            {evidencePrimary}
                          </p>
                          <p className="mt-0.5 truncate text-label-12 text-sio-fg-muted">
                            {evidenceSub}
                          </p>
                        </div>
                      </Link>

                      <Link
                        href={detailHref}
                        className="btn-secondary w-full shrink-0 touch-manipulation sm:w-auto"
                      >
                        Review
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-auto shrink-0 pt-1">
            <Pager
              page={safePage}
              pageCount={pageCount}
              prevHref={safePage > 1 ? queueHref({ page: safePage - 1 }) : null}
              nextHref={
                safePage < pageCount ? queueHref({ page: safePage + 1 }) : null
              }
            />
          </div>
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
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <MenuContainer>
        <MenuButton showChevron variant="secondary">
          <FilterIcon className="size-3.5 shrink-0" />
          Filters
        </MenuButton>
        <Menu width={220}>
          <MenuSection title="Status">
            {STATUS_OPTIONS.map((option) => {
              const count =
                option.value === "new"
                  ? pendingCount
                  : option.value === "reviewed"
                    ? reviewedCount
                    : allCount;
              return (
                <MenuItem
                  key={option.value}
                  active={statusFilter === option.value}
                  href={queueHref({
                    status: option.value,
                    page: 1,
                    preview: null,
                  })}
                  suffix={
                    <span className="tabular text-label-12 text-sio-fg-muted">
                      {count}
                    </span>
                  }
                >
                  {option.label}
                </MenuItem>
              );
            })}
          </MenuSection>
          <MenuDivider />
          <MenuSection title="Type">
            {TYPE_OPTIONS.map((option) => (
              <MenuItem
                key={option.value}
                active={typeFilter === option.value}
                href={queueHref({
                  type: option.value,
                  page: 1,
                  preview: null,
                })}
              >
                {option.label}
              </MenuItem>
            ))}
          </MenuSection>
        </Menu>
      </MenuContainer>
      <p className="tabular shrink-0 text-label-13 text-sio-fg-subtle">
        {pendingUnavailable ? (
          <>
            <span className="text-sio-fg-muted">Pending unavailable</span>
            <span className="text-sio-fg-muted" aria-hidden>
              {" "}
              ·{" "}
            </span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <span className="text-sio-fg-base">{pendingCount} pending</span>
            <span className="text-sio-fg-muted" aria-hidden>
              {" "}
              ·{" "}
            </span>
          </>
        ) : null}
        {pageItemCount} of {filteredCount}
      </p>
    </div>
  );
}
