"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { FilterIcon } from "@/components/icons/FilterIcon";
import { SignalQueueRow, QUEUE_GRID } from "@/components/SignalQueueRow";
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
  queueSignalSummary,
  signalReviewStatusLabel,
  signalTypeLabel,
} from "@/lib/format";
import { viewHref, type StatusFilter, type TypeFilter } from "@/lib/views";
import type { Conversation, Message, Signal } from "@/lib/types";

/** Prefer store name; fall back to “Name (channel) …” summary prefix for Neon stubs. */
function resolveCustomerName(
  conversationId: string,
  customerNames: Record<string, string>,
  summary: string,
): string {
  const fromStore = customerNames[conversationId]?.trim();
  if (fromStore) return fromStore;
  const match = summary.match(/^([A-Za-z][A-Za-z .'-]{0,60}?)\s*\(/);
  if (match?.[1]) return match[1].trim();
  return "Customer";
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "Pending" },
  { value: "reviewed", label: "Reviewed" },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "lead", label: "Lead" },
  { value: "retention", label: "Retention" },
  { value: "upsell", label: "Upsell" },
];

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
  /** conversationId → customerName for User column avatars. */
  customerNames?: Record<string, string>;
  /** conversationId → messages for Open Conversation in expand. */
  messagesByConversationId?: Record<string, Message[]>;
  /** conversationId → conversation for Ground Truth in expand. */
  conversationsById?: Record<string, Conversation>;
  /** Set when FastAPI needs-review could not be loaded. */
  queueError?: string | null;
  statusFilter?: StatusFilter;
  typeFilter?: TypeFilter;
  page?: number;
  /** Inline Insights expand selection (`?preview=`). */
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
      queueHref={queueHref}
    />
  );
}

export function SignalQueue({
  pendingSignals,
  reviewedSignals,
  customerNames = {},
  messagesByConversationId = {},
  conversationsById = {},
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
            queueHref={queueHref}
          />
        ) : null}
        <div
          className="panel flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-10"
          role="alert"
        >
          <p className="text-heading-16 text-sio-fg-base">
            Needs-Review Queue Unavailable
          </p>
          <p className="mt-1.5 max-w-sm text-pretty text-label-13 text-sio-fg-muted">
            Signal Score backend unavailable — needs-review queue cannot load
            from Neon. Start FastAPI and refresh.
          </p>
          {queueError ? (
            <p className="mt-2 max-w-sm break-words text-label-12 text-sio-fg-muted">
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
        <p className="mt-1.5 max-w-sm text-pretty text-label-13 text-sio-fg-muted">
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
          queueHref={queueHref}
        />
      ) : null}

      {showPendingError && statusFilter === "all" ? (
        <div
          className="status-banner status-banner-warning shrink-0"
          role="alert"
        >
          <p className="text-copy-14 text-sio-fg-base">
            Neon needs-review queue unavailable
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
          <p className="mt-1.5 max-w-sm text-pretty text-label-13 text-sio-fg-muted">
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-sio-border-base bg-sio-bg-base">
          <div className="scroll-region min-h-0 flex-1">
            <div
              className="sticky top-0 z-10 hidden h-10 shrink-0 items-center gap-3 border-b border-sio-border-base bg-sio-bg-base px-3.5 sm:flex lg:gap-4"
              role="row"
            >
              <div
                className={`grid min-w-0 flex-1 items-center gap-3 lg:gap-4 ${QUEUE_GRID}`}
              >
                <span
                  className="text-label-12 font-semibold text-sio-fg-base"
                  role="columnheader"
                >
                  User
                </span>
                <span
                  className="text-label-12 font-semibold text-sio-fg-base"
                  role="columnheader"
                >
                  Signal
                </span>
                <span
                  className="text-label-12 font-semibold text-sio-fg-base"
                  role="columnheader"
                >
                  Status
                </span>
                <span
                  className="text-label-12 font-semibold text-sio-fg-base"
                  role="columnheader"
                >
                  Score
                </span>
                <span
                  className="text-label-12 font-semibold text-sio-fg-base"
                  role="columnheader"
                >
                  Type
                </span>
                <span
                  className="hidden text-label-12 font-semibold text-sio-fg-base lg:block"
                  role="columnheader"
                >
                  Evidence
                </span>
              </div>
              <span
                className="w-[4.5rem] shrink-0 text-left text-label-12 font-semibold text-sio-fg-base"
                role="columnheader"
              >
                Action
              </span>
            </div>

            <ul className="flex flex-col divide-y divide-sio-border-base">
              {filtered.map((signal) => {
                const score = formatScore(signal.score);
                const typeLabel = signalTypeLabel(signal.type);
                const statusText = signalReviewStatusLabel(signal);
                const selected = previewId === signal.id;
                const customerName = resolveCustomerName(
                  signal.conversationId,
                  customerNames,
                  signal.summary || "",
                );
                const previewHref = queueHref({
                  preview: selected ? null : signal.id,
                  page,
                });
                const summaryForLabel =
                  queueSignalSummary(signal.summary || "", customerName) ||
                  "signal";
                const messages =
                  messagesByConversationId[signal.conversationId] ?? [];
                const conversation =
                  conversationsById[signal.conversationId] ?? null;

                return (
                  <li
                    key={signal.backendSignalId ?? signal.id}
                    data-queue-row
                    className="shrink-0"
                  >
                    <SignalQueueRow
                      signal={signal}
                      customerName={customerName}
                      selected={selected}
                      previewHref={previewHref}
                      previewAriaLabel={
                        selected
                          ? `${customerName}. Collapse review for ${summaryForLabel}`
                          : `${customerName}. ${typeLabel} signal, score ${score}, ${statusText}. Expand review for ${summaryForLabel}`
                      }
                      messages={messages}
                      conversation={conversation}
                      action={
                        <div className="w-full shrink-0 sm:flex sm:w-[4.5rem] sm:justify-start">
                          <Link
                            href={previewHref}
                            scroll={false}
                            aria-expanded={selected}
                            aria-controls={`signal-expand-${signal.id}`}
                            className="btn-secondary min-h-11 w-full shrink-0 !rounded-full touch-manipulation sm:min-h-0 sm:h-8 sm:w-auto sm:px-3"
                          >
                            Review
                          </Link>
                        </div>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
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
  queueHref,
}: {
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  pendingCount: number;
  reviewedCount: number;
  allCount: number;
  queueHref: (next: {
    status?: StatusFilter;
    type?: TypeFilter;
    page?: number;
    preview?: string | null;
  }) => string;
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
    </div>
  );
}
