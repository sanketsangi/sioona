"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react/ssr";
import {
  createColumnHelper,
  createPaginatedRowModel,
  FlexRender,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ADD_FILTER_ACTION_OPTIONS,
  ADD_FILTER_STATUS_OPTIONS,
  ADD_FILTER_TYPE_OPTIONS,
  AddFilterPopover,
} from "@/components/AddFilterPopover";
import {
  FilterPillFrame,
  FilterPillTrigger,
} from "@/components/FilterPill";
import { FilterIcon } from "@/components/icons/FilterIcon";
import { LayersIcon } from "@/components/icons/LayersIcon";
import { XIcon } from "@/components/icons/XIcon";
import {
  SignalQueueRow,
  SignalQueueCard,
  QUEUE_REVIEW_ACTION_CLASS,
  QUEUE_CARD_ACTION_CLASS,
} from "@/components/SignalQueueRow";
import {
  SignalReviewMissing,
  SignalReviewPanel,
} from "@/components/SignalReviewPanel";
import { SignalReviewBody } from "@/components/SignalReviewBody";
import { QueueMarkActedAction } from "@/components/QueueMarkActedAction";
import {
  isRetentionDecisionKind,
  queueActionKindForSignal,
  queueActionLabelForSignal,
  RetentionEmailDecisionChip,
} from "@/components/RetentionEmailAction";
import { findSupervisedAction } from "@/lib/supervised-actions";
import { PagerIconLink } from "@/components/PagerIconLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { scoreChipAccessibleName } from "@/lib/fired-rule";
import {
  queueSignalSummary,
  signalReviewStatusLabel,
  signalTypeLabel,
} from "@/lib/format";
import type { MarkActedWalk } from "@/lib/use-mark-acted";
import {
  statusQueryValue,
  viewHref,
  type ActionFilter,
  type SignalReviewTriage,
  type StatusFilter,
  type TypeFilter,
  type WorkspaceMode,
} from "@/lib/views";
import {
  readVaultKeepSetRefreshAttempt,
  VAULT_IMPORT_LANDING_DESCRIPTION,
  VAULT_IMPORT_LANDING_TITLE,
  vaultKeepSetRefreshDelay,
} from "@/lib/vault-file";
import {
  FOLLOWUP_UNAVAILABLE_PANEL_BODY,
  FOLLOWUP_UNAVAILABLE_PANEL_TITLE,
  QUEUE_UNAVAILABLE_PANEL_BODY,
  QUEUE_UNAVAILABLE_PANEL_TITLE,
  SCORE_WAITING_BODY,
  SCORE_WAITING_TITLE,
} from "@/lib/backend-wake";
import {
  queueSignalsForFilter,
  resolvePreviewSignal,
} from "@/lib/join-needs-review";
import type {
  Conversation,
  Message,
  Signal,
  SupervisedAction,
} from "@/lib/types";
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
 * Both panes stay mounted after the first client paint. List ↔ review
 * opacity/transform runs only when `data-insights-motion="1"` (mode actually
 * toggled). Vault file switches stay on list with no enter animation.
 * Review deep-links omit the list table from SSR so hydration is a single
 * tree. List SSR omits the review pane for the same reason (duplicate
 * `signal-summary-*` ids). Holds the last review tree after `?preview=`
 * clears so an exit fade still has content when motion is on.
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
  const prevModeRef = useRef(mode);
  const [motion, setMotion] = useState(false);
  // Review deep-links must not SSR the list table. List must not SSR the
  // review table. Both panes used the same `signal-summary-*` ids.
  const listMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => listActive,
  );

  useLayoutEffect(() => {
    if (prevModeRef.current !== mode) {
      setMotion(true);
      prevModeRef.current = mode;
    }
  }, [mode]);

  /* eslint-disable react-hooks/refs -- snapshot last review pane for exit fade */
  if (reviewActive && reviewKey) {
    heldReviewRef.current = review;
  }
  const reviewNode = reviewActive ? review : heldReviewRef.current;
  /* eslint-enable react-hooks/refs */

  return (
    <div
      className="insights-mode-swap"
      data-insights-mode={mode}
      data-insights-motion={motion ? "1" : "0"}
    >
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

const STATUS_OPTIONS = ADD_FILTER_STATUS_OPTIONS;
const ACTION_OPTIONS = ADD_FILTER_ACTION_OPTIONS;
const TYPE_OPTIONS = ADD_FILTER_TYPE_OPTIONS;

function statusFilterCount(
  value: StatusFilter,
  counts: {
    pendingCount: number;
    followUpCount: number;
    doneCount: number;
    allCount: number;
  },
): number {
  if (value === "new") return counts.pendingCount;
  if (value === "followup") return counts.followUpCount;
  if (value === "acted") return counts.doneCount;
  return counts.allCount;
}

function actionFilterCount(
  value: Exclude<ActionFilter, "all">,
  counts: { approveCount: number; reviewCount: number },
): number {
  return value === "approve" ? counts.approveCount : counts.reviewCount;
}

type QueueHref = (next: {
  status?: StatusFilter;
  type?: TypeFilter;
  action?: ActionFilter;
  page?: number;
  preview?: string | null;
}) => string;

type EmptyNext = {
  /** Optional empty-panel title (Vault file mismatch, etc.). */
  title?: string;
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
  actionFilter?: ActionFilter;
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
  /** Stored supervised action drafts (retention email first). */
  supervisedActions?: SupervisedAction[];
  /**
   * Score service is asleep and the Neon queue is empty or unreachable
   * while JSON still has the keep-set. Empty panels say the score is
   * waiting and offer one Retry — not “reviews are done”.
   */
  scoreAsleep?: boolean;
  /**
   * Replace upload whose file is not on this instance yet.
   * The empty panel waits for Neon instead of asking for another upload.
   */
  landingFile?: string | null;
};

function buildQueueHref(
  queryExtras: Record<string, string | undefined | null> | undefined,
  statusFilter: StatusFilter,
  typeFilter: TypeFilter,
  actionFilter: ActionFilter,
  previewId: string | null | undefined,
): QueueHref {
  const workspaceMode: WorkspaceMode =
    queryExtras?.mode === "action" ? "action" : "shadow";
  return (next) => {
    const status = next.status ?? statusFilter;
    const type = next.type ?? typeFilter;
    const action = next.action ?? actionFilter;
    const pageNum = next.page ?? 1;
    const preview = next.preview !== undefined ? next.preview : previewId;
    return viewHref("insights", {
      ...queryExtras,
      status: statusQueryValue(status, workspaceMode),
      type: type === "all" ? null : type,
      action: action === "all" ? null : action,
      page: pageNum > 1 ? String(pageNum) : null,
      preview: preview || null,
    });
  };
}

/** Same Card chrome as InsightsQueueMetrics — sio radius, no elevation. */
const QUEUE_CARD_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base py-0 shadow-none ring-0 outline-none [--tw-ring-color:transparent]";

function ScoreWaitingPanel() {
  return (
    <QueueEmptyState
      alert
      title={SCORE_WAITING_TITLE}
      description={<p>{SCORE_WAITING_BODY}</p>}
    />
  );
}

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
  "sticky top-0 z-20 bg-sidebar [&_tr]:border-b [&_th]:bg-sidebar";

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
  actionFilter,
  supervisedActions,
}: {
  pendingSignals: Signal[];
  reviewedSignals: Signal[];
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  actionFilter: ActionFilter;
  supervisedActions?: SupervisedAction[];
}) {
  return useMemo(
    () =>
      queueSignalsForFilter({
        pending: pendingSignals,
        reviewed: reviewedSignals,
        status: statusFilter,
        type: typeFilter,
        action: actionFilter,
        supervisedActions,
      }),
    [
      pendingSignals,
      reviewedSignals,
      statusFilter,
      typeFilter,
      actionFilter,
      supervisedActions,
    ],
  );
}

/** Filters + count summary for Insights — immediately above the queue table. */
export function SignalQueueFilters({
  pendingSignals,
  reviewedSignals,
  statusFilter = "all",
  typeFilter = "all",
  actionFilter = "all",
  previewId = null,
  queryExtras,
  supervisedActions = [],
}: Omit<SignalQueueProps, "showFilters">) {
  const {
    pendingCount,
    followUpCount,
    doneCount,
    allCount,
    approveCount,
    reviewCount,
  } = useQueueList({
    pendingSignals,
    reviewedSignals,
    statusFilter,
    typeFilter,
    actionFilter,
    supervisedActions,
  });
  const queueHref = buildQueueHref(
    queryExtras,
    statusFilter,
    typeFilter,
    actionFilter,
    previewId,
  );

  return (
    <QueueFilters
      statusFilter={statusFilter}
      typeFilter={typeFilter}
      actionFilter={actionFilter}
      pendingCount={pendingCount}
      followUpCount={followUpCount}
      doneCount={doneCount}
      allCount={allCount}
      approveCount={approveCount}
      reviewCount={reviewCount}
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
  supervisedActions = [],
}: {
  signals: Signal[];
  page: number;
  customerNames: Record<string, string>;
  queueHref: QueueHref;
  supervisedActions?: SupervisedAction[];
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
      <div className="hide-scrollbar relative hidden min-h-0 flex-1 overflow-auto md:block">
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
              const item = queueRowItem(
                row.original,
                customerNames,
                queueHref,
                safePage,
                supervisedActions,
              );
              return (
                <SignalQueueRow
                  key={row.id}
                  signal={item.signal}
                  customerName={item.customerName}
                  previewHref={item.previewHref}
                  previewAriaLabel={item.previewAriaLabel}
                  action={item.tableAction}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 md:hidden">
        {rows.map((row) => {
          const item = queueRowItem(
            row.original,
            customerNames,
            queueHref,
            safePage,
            supervisedActions,
          );
          return (
            <SignalQueueCard
              key={`card-${row.id}`}
              signal={item.signal}
              customerName={item.customerName}
              previewHref={item.previewHref}
              previewAriaLabel={item.previewAriaLabel}
              action={item.cardAction}
            />
          );
        })}
      </ul>
      <QueueTablePager
        page={safePage}
        pageCount={pageCount}
        rowCount={signals.length}
        queueHref={queueHref}
      />
    </QueueCard>
  );
}

function queueRowItem(
  signal: Signal,
  customerNames: Record<string, string>,
  queueHref: QueueHref,
  safePage: number,
  supervisedActions: SupervisedAction[],
) {
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
    queueSignalSummary(signal.summary || "", customerName) || "signal";
  const storedAction = findSupervisedAction(supervisedActions, signal);
  const actionKind = queueActionKindForSignal(
    signal,
    customerName,
    storedAction,
  );
  const actionLabel = queueActionLabelForSignal(
    signal,
    customerName,
    storedAction,
  );
  const openVerb =
    actionLabel === "Approve" ? "Open approval for" : "Open review for";
  const decisionAction = isRetentionDecisionKind(actionKind) ? (
    <RetentionEmailDecisionChip status={actionKind} />
  ) : null;
  const tableAction = decisionAction ?? (
    actionKind === "mark_acted" ? (
      <QueueMarkActedAction
        signal={signal}
        summaryForLabel={summaryForLabel}
      />
    ) : (
      <Button
        asChild
        variant="outline"
        size="sm"
        className={QUEUE_REVIEW_ACTION_CLASS}
      >
        <Link href={previewHref} scroll={false}>
          {actionLabel}
        </Link>
      </Button>
    )
  );
  const cardAction = decisionAction ?? (
    actionKind === "mark_acted" ? (
      <QueueMarkActedAction
        signal={signal}
        summaryForLabel={summaryForLabel}
      />
    ) : (
      <Button
        asChild
        variant="outline"
        size="sm"
        className={QUEUE_CARD_ACTION_CLASS}
      >
        <Link href={previewHref} scroll={false}>
          {actionLabel}
        </Link>
      </Button>
    )
  );

  return {
    signal,
    customerName,
    previewHref,
    previewAriaLabel: `${customerName}. ${typeLabel} signal, ${scoreChipAccessibleName(signal.score, signal.evidence, signal.type)}, ${statusText}. ${openVerb} ${summaryForLabel}`,
    tableAction,
    cardAction,
  };
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
  actionFilter = "all",
  page = 1,
  previewId = null,
  queryExtras,
  showFilters = true,
  pendingClear = null,
  followUpEmpty = null,
  doneEmpty = null,
  reviewTriage,
  actedWalk = null,
  supervisedActions = [],
  scoreAsleep = false,
  landingFile = null,
}: SignalQueueProps) {
  const [landingOpen, setLandingOpen] = useState(Boolean(landingFile));
  useEffect(() => {
    if (!landingFile) {
      setLandingOpen(false);
      return;
    }
    const attempt = readVaultKeepSetRefreshAttempt(landingFile);
    setLandingOpen(vaultKeepSetRefreshDelay(attempt) != null);
  }, [landingFile]);
  const {
    pendingCount,
    followUpCount,
    doneCount,
    allCount,
    approveCount,
    reviewCount,
    filtered,
  } = useQueueList({
    pendingSignals,
    reviewedSignals,
    statusFilter,
    typeFilter,
    actionFilter,
    supervisedActions,
  });

  const queueHref = buildQueueHref(
    queryExtras,
    statusFilter,
    typeFilter,
    actionFilter,
    previewId,
  );

  const backToQueueHref = queueHref({ preview: null, page });

  // Resolve preview across pending + reviewed (deep links ignore active filters).
  // Neon stub ids (`sig_neon_…`) still open the joined JSON card.
  const previewSignal = useMemo(
    () => resolvePreviewSignal(previewId, pendingSignals, reviewedSignals),
    [previewId, pendingSignals, reviewedSignals],
  );

  const filterChrome = showFilters ? (
    <QueueFilters
      statusFilter={statusFilter}
      typeFilter={typeFilter}
      actionFilter={actionFilter}
      pendingCount={pendingCount}
      followUpCount={followUpCount}
      doneCount={doneCount}
      allCount={allCount}
      approveCount={approveCount}
      reviewCount={reviewCount}
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
              actionLabel={queueActionLabelForSignal(
                previewSignal,
                previewCustomerName,
                findSupervisedAction(supervisedActions, previewSignal),
                "review",
              )}
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
              supervisedAction={findSupervisedAction(
                supervisedActions,
                previewSignal,
              )}
            />
          </div>
        ) : null}
      </div>
    );
  }

  const showPendingError =
    Boolean(queueError) &&
    statusFilter === "new" &&
    pendingSignals.length === 0 &&
    !landingFile;
  const showFollowUpError =
    Boolean(tenantSignalsError) &&
    (statusFilter === "followup" || statusFilter === "acted") &&
    filtered.length === 0;

  const asleepEmpty =
    scoreAsleep &&
    !previewSignal &&
    (showPendingError ||
      showFollowUpError ||
      (pendingSignals.length === 0 &&
        (reviewedSignals.length === 0 ||
          (statusFilter === "new" && filtered.length === 0) ||
          (statusFilter === "followup" && filtered.length === 0))));

  if (asleepEmpty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {filterChrome}
        <ScoreWaitingPanel />
      </div>
    );
  }

  if (showPendingError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {filterChrome}
        <QueueEmptyState
          alert
          title={QUEUE_UNAVAILABLE_PANEL_TITLE}
          description={<p>{QUEUE_UNAVAILABLE_PANEL_BODY}</p>}
        >
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={queueHref({ status: "new", type: "all", page: 1 })}
              className="btn-primary"
            >
              Retry Queue
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
          description={<p>{FOLLOWUP_UNAVAILABLE_PANEL_BODY}</p>}
        >
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={queueHref({ status: statusFilter, type: "all", page: 1 })}
              className="btn-primary"
            >
              Retry Queue
            </Link>
          </div>
        </QueueEmptyState>
      </div>
    );
  }

  if (pendingSignals.length === 0 && reviewedSignals.length === 0) {
    const opening = Boolean(landingFile) && landingOpen;
    const next = opening ? null : pendingClear;
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {filterChrome}
        <QueueEmptyState
          title={
            opening
              ? VAULT_IMPORT_LANDING_TITLE
              : (next?.title ?? "No Signals Yet")
          }
          description={
            opening
              ? VAULT_IMPORT_LANDING_DESCRIPTION
              : (next?.description ??
                "Upload chats or re-run detection to populate Shadow Mode.")
          }
        >
          {opening ? null : (
            <Link
              href={next?.href ?? viewHref("upload")}
              className="btn-primary mt-4"
            >
              {next?.label ?? "Uploaded Chats"}
              <ArrowRight className="size-3.5" weight="bold" aria-hidden />
            </Link>
          )}
        </QueueEmptyState>
      </div>
    );
  }

  const emptyCopy = ((): {
    title: string;
    description: string;
    next: EmptyNext | null;
  } => {
    if (actionFilter !== "all") {
      return {
        title:
          actionFilter === "approve"
            ? "No Approve Signals"
            : "No Review Signals",
        description: "Try another filter, or clear filters to see the full queue.",
        next: {
          description: "",
          href: queueHref({ action: "all", page: 1 }),
          label: "Clear Action Filter",
        },
      };
    }
    if (statusFilter === "new") {
      return {
        title: pendingClear?.title ?? "No Signals Need Review",
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
        title:
          followUpEmpty?.title ??
          (mirrorPendingEmpty
            ? "No Signals Need Review"
            : "No Correct Signals"),
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
        href: queueHref({
          status: "all",
          type: "all",
          action: "all",
          page: 1,
        }),
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
              href={queueHref({
                status: "all",
                type: "all",
                action: "all",
                page: 1,
              })}
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
          supervisedActions={supervisedActions}
        />
      )}
    </div>
  );
}

function FilterCountBadge({ count }: { count: number }) {
  const digitCount = String(count).length;
  return (
    <span
      data-filter-count=""
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-sio-border-base text-sio-fg-base",
        digitCount >= 3
          ? "h-6 min-w-6 rounded-[10ex] px-2"
          : cn(
              "rounded-[100%]",
              digitCount === 1 ? "size-6" : "h-6 min-w-6 px-1.5",
            ),
      )}
    >
      <span className="tabular text-label-12 font-medium leading-none">
        {count}
      </span>
    </span>
  );
}

function FilterPillClear({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      data-filter-pill-clear=""
      className="absolute top-0 right-0 z-10 flex size-8 cursor-pointer items-center justify-end pr-1 text-[#7d7d7d] outline-none !ring-0 before:absolute before:-inset-1.5 before:content-[''] hover:text-sio-fg-base focus-visible:[&_[data-filter-clear-face]]:shadow-[var(--focus-ring)] touch-manipulation md:before:inset-0"
    >
      <span
        data-filter-clear-face=""
        className="relative flex size-5 items-center justify-center rounded-full border border-[#ebebeb] bg-sio-bg-base transition-[color,border-color,background-color] duration-150 motion-reduce:transition-none"
      >
        <XIcon className="relative size-4 rounded-full" />
      </span>
    </Link>
  );
}


function QueueFilters({
  statusFilter,
  typeFilter,
  actionFilter,
  pendingCount,
  followUpCount,
  doneCount,
  allCount,
  approveCount,
  reviewCount,
  queueHref,
}: {
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  actionFilter: ActionFilter;
  pendingCount: number;
  followUpCount: number;
  doneCount: number;
  allCount: number;
  approveCount: number;
  reviewCount: number;
  queueHref: QueueHref;
}) {
  const typeLabel =
    TYPE_OPTIONS.find((option) => option.value === typeFilter)?.label ??
    "All Types";
  const typeApplied = typeFilter !== "all";
  const counts = { pendingCount, followUpCount, doneCount, allCount };
  const actionCounts = { approveCount, reviewCount };
  const clearStatusHref = queueHref({
    status: "all",
    page: 1,
    preview: null,
  });
  const clearTypeHref = queueHref({
    type: "all",
    page: 1,
    preview: null,
  });
  const clearActionHref = queueHref({
    action: "all",
    page: 1,
    preview: null,
  });

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 p-1 pointer-coarse:w-max pointer-coarse:min-w-full pointer-coarse:flex-nowrap">
      <FilterPillFrame>
        <AddFilterPopover
          typeFilter={typeFilter}
          queueHref={queueHref}
          typeApplied={typeApplied}
        >
          <FilterPillTrigger
            variant={typeApplied ? "applied" : "add"}
            clearable={typeApplied}
            aria-label={
              typeApplied ? `Queue type: ${typeLabel}` : "Add Filter"
            }
          >
            {typeApplied ? (
              <span className="flex min-w-0 flex-row items-center gap-1 font-medium whitespace-nowrap">
                <span className="shrink-0 font-normal text-sio-fg-subtle opacity-80 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100">
                  Type
                </span>
                <span className="text-sio-fg-subtle transition-colors duration-150 motion-reduce:transition-none group-hover:text-sio-fg-base">
                  {typeLabel}
                </span>
              </span>
            ) : (
              <>
                <FilterIcon className="block size-4 shrink-0 text-sio-fg-base" />
                <span
                  className="w-16 text-left font-medium leading-none whitespace-nowrap"
                  data-wide-only="true"
                >
                  Add Filter
                </span>
              </>
            )}
          </FilterPillTrigger>
        </AddFilterPopover>
        {typeApplied ? (
          <FilterPillClear href={clearTypeHref} label="Clear type filter" />
        ) : null}
      </FilterPillFrame>

      {STATUS_OPTIONS.map((option) => {
        const selected = statusFilter === option.value;
        const clearable = selected && statusFilter !== "all";
        const count = statusFilterCount(option.value, counts);
        return (
          <FilterPillFrame key={option.value}>
            <FilterPillTrigger
              variant={selected ? "applied" : "suggestion"}
              clearable={clearable}
              href={queueHref({
                status: option.value,
                page: 1,
                preview: null,
              })}
              aria-current={selected ? "true" : undefined}
              aria-label={`Queue status: ${option.label}, ${count} ${count === 1 ? "signal" : "signals"}`}
            >
              <span className="flex min-w-0 flex-row items-center gap-1.5 font-medium leading-none whitespace-nowrap">
                <span className="text-sio-fg-subtle transition-colors duration-150 motion-reduce:transition-none group-hover:text-sio-fg-base">
                  {option.label}
                </span>
                <FilterCountBadge count={count} />
              </span>
            </FilterPillTrigger>
            {clearable ? (
              <FilterPillClear
                href={clearStatusHref}
                label="Clear status filter"
              />
            ) : null}
          </FilterPillFrame>
        );
      })}

      {ACTION_OPTIONS.map((option) => {
        const selected = actionFilter === option.value;
        const count = actionFilterCount(option.value, actionCounts);
        return (
          <FilterPillFrame key={option.value}>
            <FilterPillTrigger
              variant={selected ? "applied" : "suggestion"}
              clearable={selected}
              href={queueHref({
                action: option.value,
                page: 1,
                preview: null,
              })}
              aria-current={selected ? "true" : undefined}
              aria-label={`Queue action: ${option.label}, ${count} ${count === 1 ? "signal" : "signals"}`}
            >
              <span className="flex min-w-0 flex-row items-center gap-1.5 font-medium leading-none whitespace-nowrap">
                <span className="text-sio-fg-subtle transition-colors duration-150 motion-reduce:transition-none group-hover:text-sio-fg-base">
                  {option.label}
                </span>
                <FilterCountBadge count={count} />
              </span>
            </FilterPillTrigger>
            {selected ? (
              <FilterPillClear
                href={clearActionHref}
                label="Clear action filter"
              />
            ) : null}
          </FilterPillFrame>
        );
      })}
    </div>
  );
}
