"use client";

import Link from "next/link";
import { useMemo, useRef, type ComponentProps, type ReactNode } from "react";
import { ArrowRight, CaretDown, CirclesThree } from "@phosphor-icons/react/ssr";
import { FilterIcon } from "@/components/icons/FilterIcon";
import { LayersIcon } from "@/components/icons/LayersIcon";
import { LeadIcon } from "@/components/icons/LeadIcon";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import {
  SignalQueueRow,
  QUEUE_GRID,
  QUEUE_REVIEW_ACTION_CLASS,
  QUEUE_ROW_CLASS,
} from "@/components/SignalQueueRow";
import {
  SignalReviewMissing,
  SignalReviewPanel,
} from "@/components/SignalReviewPanel";
import { SignalReviewBody } from "@/components/SignalReviewBody";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { StatusDot, type StatusDotState } from "@/components/ui/StatusDot";
import {
  formatScore,
  queueSignalSummary,
  signalReviewStatusLabel,
  signalTypeLabel,
} from "@/lib/format";
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

/**
 * Overlay Insights queue list and preview review.
 * Both panes stay mounted; `data-insights-mode` transitions opacity/transform.
 * Holds the last review tree after `?preview=` clears so the exit fade still has content.
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
  const heldReviewRef = useRef(review);
  const reviewActive = mode === "review";

  /* eslint-disable react-hooks/refs -- snapshot last review pane for exit fade */
  if (reviewActive && reviewKey) {
    heldReviewRef.current = review;
  }
  const reviewNode = reviewActive ? review : heldReviewRef.current;
  /* eslint-enable react-hooks/refs */

  const listActive = mode === "list";

  return (
    <div className="insights-mode-swap" data-insights-mode={mode}>
      <div
        className="insights-mode-pane insights-mode-pane-list"
        aria-hidden={!listActive}
        inert={!listActive ? true : undefined}
      >
        {list}
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

function QueueHeaderBlock() {
  return (
    <div className="hidden shrink-0 lg:block">
      <QueueColumnHeader />
      <Separator />
    </div>
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

const QUEUE_COL_HEADER = "truncate text-label-12 font-medium text-sio-fg-subtle";

/** Column labels — shared by queue list and review panel modes. */
function QueueColumnHeader() {
  return (
    <div
      className={cn(QUEUE_ROW_CLASS, QUEUE_GRID, "h-10 bg-sio-bg-base")}
      role="row"
    >
      <span className={QUEUE_COL_HEADER} role="columnheader">
        User
      </span>
      <span className={QUEUE_COL_HEADER} role="columnheader">
        Signal
      </span>
      <span className={QUEUE_COL_HEADER} role="columnheader">
        Status
      </span>
      <span className={QUEUE_COL_HEADER} role="columnheader">
        Score
      </span>
      <span className={QUEUE_COL_HEADER} role="columnheader">
        Type
      </span>
      <span className={cn("hidden xl:block", QUEUE_COL_HEADER)} role="columnheader">
        Evidence
      </span>
      <span className={cn("text-left", QUEUE_COL_HEADER)} role="columnheader">
        Action
      </span>
    </div>
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
    const reviewChrome = previewSignal ? (
      <SignalReviewPanel
        signal={previewSignal}
        customerName={previewCustomerName ?? "Customer"}
      />
    ) : (
      <SignalReviewMissing
        queueHref={backToQueueHref}
        previewId={previewId}
      />
    );

    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        {filterChrome}
        <QueueCard className="insights-review">
          <div className="min-w-0 shrink-0 overflow-x-clip bg-sio-bg-base">
            <QueueHeaderBlock />
            {reviewChrome}
          </div>
          {previewSignal ? (
            <SignalReviewBody
              key={previewSignal.id}
              signal={previewSignal}
              messages={previewMessages}
              customerName={previewCustomerName ?? "Customer"}
              conversation={previewConversation}
              triage={reviewTriage}
            />
          ) : null}
        </QueueCard>
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
        <QueueCard>
          <QueueHeaderBlock />
          <CardContent className="scroll-region min-h-0 flex-1 p-0">
            <ul className="flex flex-col">
              {filtered.map((signal, index) => {
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
                  page,
                });
                const summaryForLabel =
                  queueSignalSummary(signal.summary || "", customerName) ||
                  "signal";

                return (
                  <li
                    key={signal.backendSignalId ?? signal.id}
                    data-queue-row
                    className="shrink-0"
                  >
                    {index > 0 ? <Separator /> : null}
                    <SignalQueueRow
                      signal={signal}
                      customerName={customerName}
                      previewHref={previewHref}
                      previewAriaLabel={`${customerName}. ${typeLabel} signal, score ${score}, ${statusText}. Open review for ${summaryForLabel}`}
                      action={
                        <Link
                          href={previewHref}
                          scroll={false}
                          className={QUEUE_REVIEW_ACTION_CLASS}
                        >
                          Review
                        </Link>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </QueueCard>
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
