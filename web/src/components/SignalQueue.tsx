"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  CirclesThree,
} from "@phosphor-icons/react/ssr";
import {
  createColumnHelper,
  createPaginatedRowModel,
  FlexRender,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { FilterIcon } from "@/components/icons/FilterIcon";
import { LayersIcon } from "@/components/icons/LayersIcon";
import { LeadIcon } from "@/components/icons/LeadIcon";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import {
  SignalQueueRow,
  QUEUE_REVIEW_ACTION_CLASS,
} from "@/components/SignalQueueRow";
import {
  SignalReviewMissing,
  SignalReviewPanel,
} from "@/components/SignalReviewPanel";
import { SignalReviewBody } from "@/components/SignalReviewBody";
import { PagerIconLink } from "@/components/PagerIconLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusDot, type StatusDotState } from "@/components/ui/StatusDot";
import {
  formatScore,
  queueSignalSummary,
  signalReviewStatusLabel,
  signalTypeLabel,
} from "@/lib/format";
import type { MarkActedWalk } from "@/lib/use-mark-acted";
import {
  statusQueryValue,
  viewHref,
  type SignalReviewTriage,
  type StatusFilter,
  type TypeFilter,
  type WorkspaceMode,
} from "@/lib/views";
import {
  FOLLOWUP_UNAVAILABLE_PANEL_BODY,
  FOLLOWUP_UNAVAILABLE_PANEL_TITLE,
  QUEUE_UNAVAILABLE_PANEL_BODY,
  QUEUE_UNAVAILABLE_PANEL_TITLE,
} from "@/lib/backend-wake";
import { queueSignalsForFilter } from "@/lib/join-needs-review";
import type { Conversation, Message, Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

type InsightsMode = "list" | "review";

/** Page size for Insights queue DataTable (URL `?page=`). */
export const QUEUE_PAGE_SIZE = 10;

const queueTableFeatures = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const columnHelper = createColumnHelper<typeof queueTableFeatures, Signal>();

const queueColumns = columnHelper.columns([
  columnHelper.display({ id: "user", header: "User" }),
  columnHelper.display({ id: "signal", header: "Signal" }),
  columnHelper.display({ id: "status", header: "Status" }),
  columnHelper.display({ id: "score", header: "Score" }),
  columnHelper.display({ id: "type", header: "Type" }),
  columnHelper.display({ id: "action", header: "Action" }),
]);

/**
 * Overlay Insights queue list and preview review.
 * Both panes stay mounted after the first client paint; `data-insights-mode`
 * transitions opacity/transform. Review deep-links omit the list table from SSR
 * so hydration is a single tree. List SSR omits the review pane for the same
 * reason (duplicate `signal-summary-*` ids). Holds the last review tree after
 * `?preview=` clears so the exit fade still has content.
 * First paint uses resting styles — no enter animation on deep links.
 */
export function InsightsModeSwap({
  mode,
  reviewKey = null,
  list,
  review,
}: {
  mode: InsightsMode;
  /** Preview id while review is open; null on the list. */
  reviewKey?: string | null;
  list: ReactNode;
  review: ReactNode;
}) {
  const reviewActive = mode === "review";
  const listActive = mode === "list";
  const heldReviewRef = useRef<ReactNode>(null);
  // Review deep-links must not SSR the list table. List must not SSR the
  // review table. Both panes used the same `signal-summary-*` ids.
  const [listMounted, setListMounted] = useState(listActive);

  useEffect(() => {
    setListMounted(true);
  }, []);

  /* eslint-disable react-hooks/refs -- snapshot last review pane for exit fade */
  if (reviewActive && reviewKey) {
    heldReviewRef.current = review;
  }
  const reviewNode = reviewActive ? review : heldReviewRef.current;
  /* eslint-enable react-hooks/refs */

  return (
    <div className="insights-mode-swap" data-insights-mode={mode}>
      <div
        className="insights-mode-pane insights-mode-pane-list"
        aria-hidden={!listActive}
        inert={!listActive ? true : undefined}
      >
        {listMounted ? list : null}
      </div>
      <div
        className="insights-mode-pane insights-mode-pane-review"
        aria-hidden={!reviewActive}
        inert={!reviewActive ? true : undefined}
      >
        {reviewNode}
      </div>
    </div>
  );
}

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

const STATUS_DOT_BY_FILTER: Partial<Record<StatusFilter, StatusDotState>> = {
  new: "QUEUED",
  followup: "READY",
  acted: "CANCELED",
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "Pending" },
  { value: "followup", label: "Correct" },
  { value: "acted", label: "Done" },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "lead", label: "Lead" },
  { value: "retention", label: "Retention" },
  { value: "upsell", label: "Upsell" },
];

function statusFilterIcon(value: StatusFilter): ReactNode {
  const state = STATUS_DOT_BY_FILTER[value];
  if (state) {
    return <StatusDot state={state} className="justify-center" />;
  }
  return (
    <CirclesThree className="size-4 text-sio-fg-subtle" weight="regular" />
  );
}

function typeFilterIcon(value: TypeFilter): ReactNode {
  switch (value) {
    case "lead":
      return <LeadIcon className="size-4 shrink-0" />;
    case "retention":
      return <RetentionIcon className="size-4 shrink-0" />;
    case "upsell":
      return <UpsellIcon className="size-4 shrink-0" />;
    default:
      return <LayersIcon className="size-4 shrink-0 text-sio-fg-subtle" />;
  }
}

type QueueHref = (next: {
  status?: StatusFilter;
  type?: TypeFilter;
  page?: number;
  preview?: string | null;
}) => string;

type EmptyNext = {
  description: string;
  href: string;
  label: string;
};

type SignalQueueProps = {
  /** Neon needs-review order (joined to JSON for evidence when possible). */
  pendingSignals: Signal[];
  /** Neon-backed reviewed list (feedback + Acted); JSON fallback when GET /signals fails. */
  reviewedSignals: Signal[];
  /** conversationId → customerName for User column avatars. */
  customerNames?: Record<string, string>;
  /** conversationId → conversation for Ground Truth in review panel. */
  conversationsById?: Record<string, Conversation>;
  /** conversationId → messages for in-queue transcript + evidence jump. */
  messagesByConversationId?: Record<string, Message[]>;
  /** Set when FastAPI needs-review could not be loaded. */
  queueError?: string | null;
  /** Set when FastAPI GET /signals could not be loaded. */
  tenantSignalsError?: string | null;
  statusFilter?: StatusFilter;
  typeFilter?: TypeFilter;
  page?: number;
  /** Full-panel review selection (`?preview=`). */
  previewId?: string | null;
  /** Preserve banners / demo flags in queue URLs */
  queryExtras?: Record<string, string | undefined | null>;
  /** When false, filters are rendered by the parent (e.g. Insights header). */
  showFilters?: boolean;
  /** Pending-empty (status=new) next step after a closed week — not “upload to populate”. */
  pendingClear?: EmptyNext | null;
  /** Follow-up-empty next step (cadence or pending). */
  followUpEmpty?: EmptyNext | null;
  /** Done-empty next step → Needs Follow-Up. */
  doneEmpty?: EmptyNext | null;
  /** Pending triage — auto-advance after feedback on needs-review panels. */
  reviewTriage?: SignalReviewTriage;
  /** Follow-up Act queue — rail primary Mark as Acted. */
  actedWalk?: MarkActedWalk | null;
};

function buildQueueHref(
  queryExtras: Record<string, string | undefined | null> | undefined,
  statusFilter: StatusFilter,
  typeFilter: TypeFilter,
  previewId: string | null | undefined,
): QueueHref {
  const workspaceMode: WorkspaceMode =
    queryExtras?.mode === "action" ? "action" : "shadow";
  return (next) => {
    const status = next.status ?? statusFilter;
    const type = next.type ?? typeFilter;
    const pageNum = next.page ?? 1;
    const preview = next.preview !== undefined ? next.preview : previewId;
    return viewHref("insights", {
      ...queryExtras,
      status: statusQueryValue(status, workspaceMode),
      type: type === "all" ? null : type,
      page: pageNum > 1 ? String(pageNum) : null,
      preview: preview || null,
    });
  };
}

/** Same Card chrome as InsightsQueueMetrics — sio radius, no elevation. */
const QUEUE_CARD_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base py-0 shadow-none ring-0 outline-none [--tw-ring-color:transparent]";

function QueueCard({
  className,
  children,
  ...props
}: ComponentProps<typeof Card>) {
  return (
    <Card size="sm" className={cn(QUEUE_CARD_CLASS, className)} {...props}>
      {children}
    </Card>
  );
}

/** Shared empty / error chrome — Card shell (`data-slot="card"` for tests). */
function QueueEmptyState({
  title,
  description,
  children,
  alert = false,
}: {
  title: string;
  description: ReactNode;
  children?: ReactNode;
  alert?: boolean;
}) {
  return (
    <QueueCard role={alert ? "alert" : undefined}>
      <CardContent className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-12">
        <span
          className="mb-4 inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-sio-bg-muted text-sio-fg-subtle"
          aria-hidden
        >
          <LayersIcon className="size-4" />
        </span>
        <p className="text-balance text-heading-16 text-sio-fg-base">{title}</p>
        <div className="mt-2 max-w-sm text-pretty text-label-13 text-sio-fg-muted">
          {typeof description === "string" ? <p>{description}</p> : description}
        </div>
        {children}
      </CardContent>
    </QueueCard>
  );
}

const QUEUE_COL_HEADER =
  "truncate text-label-12 font-medium text-muted-foreground";

/** Sticky column labels — shared by queue list and review panel. */
/** Header band uses the same surface as the app sidebar. */
const QUEUE_TABLE_HEADER_CLASS =
  "sticky top-0 z-10 bg-sidebar [&_tr]:border-b [&_th]:bg-sidebar";

function QueueSignalsTableHeader() {
  return (
    <TableHeader className={QUEUE_TABLE_HEADER_CLASS}>
      <TableRow className="hover:bg-transparent">
        {queueColumns.map((column) => (
          <TableHead
            key={column.id}
            className={cn(
              QUEUE_COL_HEADER,
              column.id === "action" && "text-left",
            )}
          >
            {typeof column.header === "string" ? column.header : column.id}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

function useQueueList({
  pendingSignals,
  reviewedSignals,
  statusFilter,
  typeFilter,
}: {
  pendingSignals: Signal[];
  reviewedSignals: Signal[];
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
}) {
  return useMemo(
    () =>
      queueSignalsForFilter({
        pending: pendingSignals,
        reviewed: reviewedSignals,
        status: statusFilter,
        type: typeFilter,
      }),
    [pendingSignals, reviewedSignals, statusFilter, typeFilter],
  );
}

/** Filters + count summary for Insights header (right of section title). */
export function SignalQueueFilters({
  pendingSignals,
  reviewedSignals,
  statusFilter = "all",
  typeFilter = "all",
  previewId = null,
  queryExtras,
}: Omit<SignalQueueProps, "showFilters">) {
  const { pendingCount, followUpCount, doneCount, allCount } = useQueueList({
    pendingSignals,
    reviewedSignals,
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
      followUpCount={followUpCount}
      doneCount={doneCount}
      allCount={allCount}
      queueHref={queueHref}
    />
  );
}

function QueueTablePager({
  page,
  pageCount,
  rowCount,
  queueHref,
}: {
  page: number;
  pageCount: number;
  rowCount: number;
  queueHref: QueueHref;
}) {
  const canPrevious = page > 1;
  const canNext = page < pageCount;
  const signalLabel = rowCount === 1 ? "1 signal" : `${rowCount} signals`;

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-sio-border-base px-4 py-3">
      <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
        {signalLabel}
      </div>
      <div className="flex w-full items-center gap-8 lg:w-fit">
        <div className="flex w-fit items-center justify-center text-sm font-medium tabular">
          Page {page} of {pageCount}
        </div>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <PagerIconLink
            href={canPrevious ? queueHref({ page: 1 }) : null}
            label="Go to first page"
            className="hidden size-8 lg:flex"
          >
            <CaretDoubleLeft weight="regular" aria-hidden />
          </PagerIconLink>
          <PagerIconLink
            href={canPrevious ? queueHref({ page: page - 1 }) : null}
            label="Go to previous page"
          >
            <CaretLeft weight="regular" aria-hidden />
          </PagerIconLink>
          <PagerIconLink
            href={canNext ? queueHref({ page: page + 1 }) : null}
            label="Go to next page"
          >
            <CaretRight weight="regular" aria-hidden />
          </PagerIconLink>
          <PagerIconLink
            href={canNext ? queueHref({ page: pageCount }) : null}
            label="Go to last page"
            className="hidden size-8 lg:flex"
          >
            <CaretDoubleRight weight="regular" aria-hidden />
          </PagerIconLink>
        </div>
      </div>
    </div>
  );
}

function QueueSignalsDataTable({
  signals,
  page,
  customerNames,
  queueHref,
}: {
  signals: Signal[];
  page: number;
  customerNames: Record<string, string>;
  queueHref: QueueHref;
}) {
  const pageCount = Math.max(1, Math.ceil(signals.length / QUEUE_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const table = useTable(
    {
      features: queueTableFeatures,
      data: signals,
      columns: queueColumns,
      state: {
        pagination: {
          pageIndex: safePage - 1,
          pageSize: QUEUE_PAGE_SIZE,
        },
      },
      autoResetPageIndex: false,
      onPaginationChange: () => {
        /* URL-driven via queueHref Links */
      },
      getRowId: (row) => String(row.backendSignalId ?? row.id),
    },
    (state) => ({ pagination: state.pagination }),
  );

  const rows = table.getRowModel().rows;

  return (
    <QueueCard>
      <div className="relative min-h-0 flex-1 overflow-auto">
        <Table className="min-w-[640px]">
          <TableHeader className={QUEUE_TABLE_HEADER_CLASS}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={QUEUE_COL_HEADER}
                  >
                    {header.isPlaceholder ? null : (
                      <FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const signal = row.original;
              const score = formatScore(signal.score);
              const typeLabel = signalTypeLabel(signal.type);
              const statusText = signalReviewStatusLabel(signal);
              const customerName = resolveCustomerName(
                signal.conversationId,
                customerNames,
                signal.summary || "",
              );
              const previewHref = queueHref({
                preview: signal.id,
                page: safePage,
              });
              const summaryForLabel =
                queueSignalSummary(signal.summary || "", customerName) ||
                "signal";

              return (
                <SignalQueueRow
                  key={row.id}
                  signal={signal}
                  customerName={customerName}
                  previewHref={previewHref}
                  previewAriaLabel={`${customerName}. ${typeLabel} signal, score ${score}, ${statusText}. Open review for ${summaryForLabel}`}
                  action={
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className={QUEUE_REVIEW_ACTION_CLASS}
                    >
                      <Link href={previewHref} scroll={false}>
                        Review
                      </Link>
                    </Button>
                  }
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
      <QueueTablePager
        page={safePage}
        pageCount={pageCount}
        rowCount={signals.length}
        queueHref={queueHref}
      />
    </QueueCard>
  );
}

export function SignalQueue({
  pendingSignals,
  reviewedSignals,
  customerNames = {},
  conversationsById = {},
  messagesByConversationId = {},
  queueError = null,
  tenantSignalsError = null,
  statusFilter = "all",
  typeFilter = "all",
  page = 1,
  previewId = null,
  queryExtras,
  showFilters = true,
  pendingClear = null,
  followUpEmpty = null,
  doneEmpty = null,
  reviewTriage,
  actedWalk = null,
}: SignalQueueProps) {
  const {
    pendingCount,
    followUpCount,
    doneCount,
    allCount,
    filtered,
  } = useQueueList({
    pendingSignals,
    reviewedSignals,
    statusFilter,
    typeFilter,
  });

  const queueHref = buildQueueHref(
    queryExtras,
    statusFilter,
    typeFilter,
    previewId,
  );

  const backToQueueHref = queueHref({ preview: null, page });

  // Resolve preview across pending + reviewed (deep links ignore active filters).
  const previewSignal = useMemo(() => {
    if (!previewId) return null;
    return (
      pendingSignals.find((s) => s.id === previewId) ??
      reviewedSignals.find((s) => s.id === previewId) ??
      null
    );
  }, [previewId, pendingSignals, reviewedSignals]);

  const filterChrome = showFilters ? (
    <QueueFilters
      statusFilter={statusFilter}
      typeFilter={typeFilter}
      pendingCount={pendingCount}
      followUpCount={followUpCount}
      doneCount={doneCount}
      allCount={allCount}
      queueHref={queueHref}
    />
  ) : null;

  if (previewId) {
    const previewConversation = previewSignal
      ? (conversationsById[previewSignal.conversationId] ?? null)
      : null;
    const previewCustomerName = previewSignal
      ? resolveCustomerName(
          previewSignal.conversationId,
          customerNames,
          previewSignal.summary || "",
        )
      : null;
    const previewMessages = previewSignal
      ? (messagesByConversationId[previewSignal.conversationId] ?? [])
      : [];

    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        {filterChrome}
        <QueueCard className="min-w-0 flex-none shrink-0 overflow-hidden">
          {previewSignal && previewCustomerName != null ? (
            <SignalReviewPanel
              signal={previewSignal}
              customerName={previewCustomerName}
              header={<QueueSignalsTableHeader />}
            />
          ) : (
            <SignalReviewMissing
              queueHref={backToQueueHref}
              previewId={previewId}
            />
          )}
        </QueueCard>
        {previewSignal ? (
          <div
            className="insights-review min-h-0"
            data-review-keyboard-root=""
          >
            <SignalReviewBody
              key={previewSignal.id}
              signal={previewSignal}
              messages={previewMessages}
              customerName={previewCustomerName ?? "Customer"}
              conversation={previewConversation}
              triage={reviewTriage}
              actedWalk={actedWalk}
            />
          </div>
        ) : null}
      </div>
    );
  }

  const showPendingError =
    Boolean(queueError) &&
    statusFilter === "new" &&
    pendingSignals.length === 0;
  const showFollowUpError =
    Boolean(tenantSignalsError) &&
    (statusFilter === "followup" || statusFilter === "acted") &&
    filtered.length === 0;

  if (showPendingError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {filterChrome}
        <QueueEmptyState
          alert
          title={QUEUE_UNAVAILABLE_PANEL_TITLE}
          description={
            <>
              <p>{QUEUE_UNAVAILABLE_PANEL_BODY}</p>
              {queueError ? (
                <p className="mt-2 break-words text-label-12 text-sio-fg-muted">
                  {queueError}
                </p>
              ) : null}
            </>
          }
        >
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={queueHref({ status: "new", type: "all", page: 1 })}
              className="btn-primary"
            >
              Retry Queue
            </Link>
            <Link href={viewHref("upload")} className="btn-secondary">
              Upload Chats
            </Link>
          </div>
        </QueueEmptyState>
      </div>
    );
  }

  if (showFollowUpError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {filterChrome}
        <QueueEmptyState
          alert
          title={FOLLOWUP_UNAVAILABLE_PANEL_TITLE}
          description={
            <>
              <p>{FOLLOWUP_UNAVAILABLE_PANEL_BODY}</p>
              {tenantSignalsError ? (
                <p className="mt-2 break-words text-label-12 text-sio-fg-muted">
                  {tenantSignalsError}
                </p>
              ) : null}
            </>
          }
        >
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={queueHref({ status: statusFilter, type: "all", page: 1 })}
              className="btn-primary"
            >
              Retry Queue
            </Link>
            <Link href={viewHref("upload")} className="btn-secondary">
              Upload Chats
            </Link>
          </div>
        </QueueEmptyState>
      </div>
    );
  }

  if (pendingSignals.length === 0 && reviewedSignals.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {filterChrome}
        <QueueEmptyState
          title="No Signals Yet"
          description="Upload chats or re-run detection to populate Shadow Mode."
        >
          <Link href={viewHref("upload")} className="btn-primary mt-4">
            Upload Chats
            <ArrowRight className="size-3.5" weight="bold" aria-hidden />
          </Link>
        </QueueEmptyState>
      </div>
    );
  }

  const emptyCopy = ((): {
    title: string;
    description: string;
    next: EmptyNext | null;
  } => {
    if (statusFilter === "new") {
      return {
        title: "No Signals Need Review",
        description:
          pendingClear?.description ??
          "Upload chats or re-run detection to dual-write predictions to Neon.",
        next: pendingClear,
      };
    }
    if (statusFilter === "followup") {
      // Empty Correct with nothing pending mirrors Pending empty (cadence CTA).
      const mirrorPendingEmpty = pendingCount === 0;
      return {
        title: mirrorPendingEmpty
          ? "No Signals Need Review"
          : "No Correct Signals",
        description:
          followUpEmpty?.description ??
          (mirrorPendingEmpty
            ? "Upload chats or re-run detection to dual-write predictions to Neon."
            : "Review pending detections first."),
        next: followUpEmpty,
      };
    }
    if (statusFilter === "acted") {
      return {
        title: "No Acted Signals",
        description:
          doneEmpty?.description ??
          "Mark Acted on Correct reviews to complete the suggested step (does not send).",
        next: doneEmpty,
      };
    }
    return {
      title: "No Matching Signals",
      description: "Try another filter, or clear filters to see the full queue.",
      next: {
        description: "",
        href: queueHref({ status: "all", type: "all", page: 1 }),
        label: "Clear Filters",
      },
    };
  })();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      {filterChrome}

      {filtered.length === 0 ? (
        <QueueEmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
        >
          {emptyCopy.next ? (
            <Link href={emptyCopy.next.href} className="btn-primary mt-4">
              {emptyCopy.next.label}
              <ArrowRight className="size-3.5" weight="bold" aria-hidden />
            </Link>
          ) : (
            <Link
              href={queueHref({ status: "all", type: "all", page: 1 })}
              className="btn-secondary mt-4"
            >
              Clear Filters
            </Link>
          )}
        </QueueEmptyState>
      ) : (
        <QueueSignalsDataTable
          signals={filtered}
          page={page}
          customerNames={customerNames}
          queueHref={queueHref}
        />
      )}
    </div>
  );
}

function FilterMenuLink({
  href,
  active,
  icon,
  suffix,
  children,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  suffix?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DropdownMenuItem
      asChild
      className="h-11 min-h-11 cursor-pointer gap-2 rounded-md px-2 py-0 md:h-8 md:min-h-8"
    >
      <Link
        href={href}
        scroll={false}
        aria-current={active ? "true" : undefined}
      >
        <span
          className="flex size-4 shrink-0 items-center justify-center"
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {suffix}
      </Link>
    </DropdownMenuItem>
  );
}

function QueueFilters({
  statusFilter,
  typeFilter,
  pendingCount,
  followUpCount,
  doneCount,
  allCount,
  queueHref,
}: {
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  pendingCount: number;
  followUpCount: number;
  doneCount: number;
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="btn-secondary group outline-none focus-visible:shadow-[var(--focus-ring)] data-[state=open]:border-sio-border-strong data-[state=open]:bg-sio-bg-interactive data-[state=open]:shadow-none"
          >
            <FilterIcon className="size-3.5 shrink-0" />
            Filters
            <CaretDown
              className="size-3.5 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180"
              weight="bold"
              aria-hidden
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-56 min-w-56 overflow-hidden rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base p-0 shadow-md ring-0"
        >
          <DropdownMenuGroup className="p-2">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {STATUS_OPTIONS.map((option) => {
              const count =
                option.value === "new"
                  ? pendingCount
                  : option.value === "followup"
                    ? followUpCount
                    : option.value === "acted"
                      ? doneCount
                      : allCount;
              return (
                <FilterMenuLink
                  key={option.value}
                  active={statusFilter === option.value}
                  icon={statusFilterIcon(option.value)}
                  href={queueHref({
                    status: option.value,
                    page: 1,
                    preview: null,
                  })}
                  suffix={
                    <DropdownMenuShortcut className="tracking-normal">
                      <Badge
                        variant="secondary"
                        className="h-5 min-w-5 rounded-full border-0 bg-sio-bg-muted px-1.5 text-label-12 font-medium tabular text-sio-fg-base group-focus/dropdown-menu-item:bg-sio-bg-muted group-focus/dropdown-menu-item:text-sio-fg-base"
                      >
                        {count}
                      </Badge>
                    </DropdownMenuShortcut>
                  }
                >
                  {option.label}
                </FilterMenuLink>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="m-0 bg-sio-border-base" />
          <DropdownMenuGroup className="p-2">
            <DropdownMenuLabel>Type</DropdownMenuLabel>
            {TYPE_OPTIONS.map((option) => (
              <FilterMenuLink
                key={option.value}
                active={typeFilter === option.value}
                icon={typeFilterIcon(option.value)}
                href={queueHref({
                  type: option.value,
                  page: 1,
                  preview: null,
                })}
              >
                {option.label}
              </FilterMenuLink>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
