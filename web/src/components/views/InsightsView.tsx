import { DemoWalkthrough } from "@/components/DemoWalkthrough";
import Link from "next/link";
import { CanonicalizeInsightsStatus } from "@/components/CanonicalizeInsightsStatus";
import { ClearStaleSyncFailedParams } from "@/components/ClearStaleSyncFailedParams";
import { MarkActedHeaderAction } from "@/components/MarkActedHeaderAction";
import { OpenConversationHeaderAction } from "@/components/OpenConversationHeaderAction";
import { ConversationDrawerControlProvider } from "@/components/conversation-drawer-control";
import { ReviewWalkHeader } from "@/components/ReviewWalkHeader";
import {
  InsightsModeSwap,
  SignalQueue,
  SignalQueueFilters,
} from "@/components/SignalQueue";
import { ViewFrame } from "@/components/ViewFrame";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { VaultKeepSetRefresh } from "@/components/VaultKeepSetRefresh";
import { InsightsQueueMetrics } from "@/components/InsightsQueueMetrics";
// SignalScoreSummary stays off Insights — quiet footer trust line only.
import type { BackendSignalScore } from "@/lib/backend-client";
import { attachSignalCommercial, topCallsToday } from "@/lib/signal-commercial";
import { normalizeSignalScoreCounts } from "@/lib/eval";
import {
  customerNameFromExternalId,
  queueSignalSummary,
  signalTypeLabel,
} from "@/lib/format";
import type { NeedsReviewResult } from "@/lib/fetch-needs-review";
import type { TenantSignalsResult } from "@/lib/fetch-tenant-signals";
import {
  mergeOverlayChats,
  type HydratedChats,
} from "@/lib/hydrate-conversations";
import {
  applyChatEvidenceToSignals,
  filterPendingWithChat,
  pendingQueueSignals,
  shouldOverlayKeepSetChats,
  queueSignalsForFilter,
  resolvePreviewSignal,
  reviewedQueueSignals,
  reviewedSignalsFromStore,
} from "@/lib/join-needs-review";
import type { LlmFailureKind } from "@/lib/detect-llm";
import { shouldShowSyncFailureBanner } from "@/lib/prediction-sync";
import { buildSignalReviewTriage } from "@/lib/review-triage";
import {
  cadenceActionHref,
  pendingReviewWalkHref,
  skipPendingPreviewId,
  statusQueryValue,
  viewHref,
  type ActionFilter,
  type StatusFilter,
  type TypeFilter,
  type WorkspaceMode,
} from "@/lib/views";
import type { Signal, StoreData } from "@/lib/types";
import {
  cadenceActionCta,
  nextUnactedCorrectId,
  pilotCadenceHelperCopy,
  type PilotCadenceAction,
} from "@/lib/pilot-cadence";
import {
  isLivePartnerKeepSet,
  livePartnerVaultChrome,
  scopeChatsToUploadedFile,
  vaultFileEmptyNext,
  vaultFileIsLoaded,
} from "@/lib/vault-file";
import { resolveVaultShowcaseKind } from "@/lib/vault-showcase";
import { VaultShowcaseLoader } from "@/components/VaultShowcaseLoader";

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

export function InsightsView({
  store,
  searchQuery = "",
  demo,
  importedCount,
  newSignalCount,
  jsonKeepSet = false,
  statusFilter,
  statusOmitted = false,
  typeFilter,
  actionFilter = "all",
  page,
  previewId = null,
  needsReview,
  tenantSignals,
  overlayChats = null,
  scoreFrom = null,
  scoreTo = null,
  syncFailed = 0,
  syncCreated = 0,
  llmAdded = 0,
  llmFailed = 0,
  llmFailure = null,
  cadenceAction,
  cadencePreviewId = null,
  workspaceMode = "shadow",
  backendScore = null,
  vaultFile = null,
  uploadedFileNames = [],
  precomputedPending = null,
  precomputedReviewed = null,
  scoreUnavailable = false,
  callToday = false,
  showDemoActions = true,
}: {
  store: StoreData;
  searchQuery?: string;
  demo?: boolean;
  importedCount?: number | null;
  newSignalCount?: number | null;
  /** Replace-ingest / showcase landing: preserve `replaced=1` in walk URLs. */
  jsonKeepSet?: boolean;
  statusFilter: StatusFilter;
  /** Request URL omitted `status` — client may canonicalize via replaceState. */
  statusOmitted?: boolean;
  typeFilter: TypeFilter;
  actionFilter?: ActionFilter;
  page: number;
  previewId?: string | null;
  /** Windowed keep-set score — list footer (n / ≥5 and correct/reviewed), not SignalScoreSummary. */
  backendScore?: BackendSignalScore | null;
  needsReview: NeedsReviewResult;
  tenantSignals: TenantSignalsResult;
  /** Request-scoped Neon chats when JSON misses conversation rows. */
  overlayChats?: HydratedChats | null;
  /** Preserve Eval `?scoreFrom=` across queue filters. */
  scoreFrom?: string | null;
  scoreTo?: string | null;
  syncFailed?: number;
  syncCreated?: number;
  llmAdded?: number;
  llmFailed?: number;
  llmFailure?: LlmFailureKind | null;
  cadenceAction: PilotCadenceAction;
  /** First Correct-not-Acted signal for cadence Mark Acted deep links. */
  cadencePreviewId?: string | null;
  /** Action Mode keeps Follow-up Act queue in the URL. */
  workspaceMode?: WorkspaceMode;
  /** Vault `?file=` — scope queue to that keep-set name when it matches. */
  vaultFile?: string | null;
  /**
   * Files already in this store (`sourceFile` stamps). A sibling of the
   * latest upload is loaded — it is not an empty “upload this file” state.
   */
  uploadedFileNames?: string[];
  /** From page.tsx — avoid recomputing the same joins for cadence + view. */
  precomputedPending?: Signal[] | null;
  precomputedReviewed?: Signal[] | null;
  /** Score service did not answer. Keeps last queue counts and one Retry. */
  scoreUnavailable?: boolean;
  /** `?call=today` — first 10 pending signals by urgency × value. */
  callToday?: boolean;
  /** Hide Reset and Partner Demo when production disables those actions. */
  showDemoActions?: boolean;
}) {
  const vaultLoaded = vaultFileIsLoaded(
    vaultFile,
    store.pilot?.lastUploadedFileName,
    uploadedFileNames,
    store.conversations.length,
  );
  const landingChats =
    !resolveVaultShowcaseKind(vaultFile) &&
    importedCount != null &&
    importedCount > 0 &&
    store.conversations.length < importedCount &&
    (Boolean(vaultFile) ||
      livePartnerVaultChrome({
        activeFile: store.pilot?.lastUploadedFileName,
        lastUploadedFileName: store.pilot?.lastUploadedFileName,
        uploadedFileNames,
        chatCount: store.conversations.length,
      }));
  /**
   * Sample / Partner Demo still wipe+seed in the background. The queue is
   * already scoped to that file, so the previous pack's signals are not left
   * on screen. Do not treat the switch as an upload-mismatch empty state.
   */
  const vaultShowcaseKind =
    showDemoActions &&
    store.tenant.id === "tenant_demo" &&
    !vaultLoaded &&
    vaultFile
      ? resolveVaultShowcaseKind(vaultFile)
      : null;
  const vaultMismatch = Boolean(vaultFile && !vaultLoaded && !vaultShowcaseKind);
  const vaultEmpty =
    vaultMismatch && vaultFile ? vaultFileEmptyNext(vaultFile) : null;
  const queueError = needsReview.ok ? null : needsReview.error;
  const tenantSignalsError = tenantSignals.ok ? null : tenantSignals.error;
  const pendingJoined =
    precomputedPending ??
    (needsReview.ok
      ? pendingQueueSignals(
          needsReview.predictions,
          store.signals,
          tenantSignals.ok ? tenantSignals.rows : undefined,
        )
      : store.signals.filter((s) => !s.feedback));
  const reviewedJoined =
    precomputedReviewed ??
    (tenantSignals.ok
      ? reviewedQueueSignals(tenantSignals.rows, store.signals)
      : reviewedSignalsFromStore(store.signals));
  const chats = mergeOverlayChats(
    store.conversations,
    store.messages,
    shouldOverlayKeepSetChats({
      jsonKeepSet,
      jsonConversationCount: store.conversations.length,
    })
      ? overlayChats
      : null,
  );
  const queueChats = scopeChatsToUploadedFile(
    chats,
    vaultFile,
    uploadedFileNames,
    store.pilot?.lastUploadedFileName,
  );
  const fileScoped = queueChats !== chats;
  const conversationIds = fileScoped
    ? new Set(queueChats.conversations.map((conversation) => conversation.id))
    : null;
  function signalsForFile(signals: Signal[]) {
    if (searchQuery) {
      const matches = new Set([
        ...(needsReview.ok ? needsReview.predictions : []),
        ...(tenantSignals.ok ? tenantSignals.rows : []),
      ].map((row) => row.id));
      signals = signals.filter((signal) => Boolean(signal.backendSignalId && matches.has(signal.backendSignalId)));
    }
    if (!conversationIds) return signals;
    return signals.filter((signal) =>
      conversationIds.has(signal.conversationId),
    );
  }
  let pendingSignals = vaultMismatch
    ? []
    : applyChatEvidenceToSignals(
        signalsForFile(
          filterPendingWithChat(pendingJoined, queueChats.conversations),
        ),
        queueChats,
        store.taxonomyOverrides,
      );
  const reviewedSignals = vaultMismatch
    ? []
    : applyChatEvidenceToSignals(
        signalsForFile(
          filterPendingWithChat(reviewedJoined, queueChats.conversations),
        ),
        queueChats,
        store.taxonomyOverrides,
      );
  // Prev / Next / Skip + Mark Acted advances walk the filtered subset
  // (status list is separate; walk is always pending / Follow-up ∩ type ∩ action).
  pendingSignals = pendingSignals.map((signal) =>
    signal.urgency
      ? signal
      : attachSignalCommercial(signal, (signal.evidence ?? []).join("\n")),
  );
  const supervisedActions = store.supervisedActions ?? [];
  const filteredPending = queueSignalsForFilter({
    pending: pendingSignals,
    reviewed: [],
    status: "new",
    type: typeFilter,
    action: actionFilter,
    supervisedActions,
  }).filtered;
  // Top 10 is only the list and the walk. Counts and filters stay on the full queue.
  const listPendingSignals = callToday
    ? topCallsToday(filteredPending)
    : pendingSignals;
  const walkPendingSignals = callToday ? listPendingSignals : filteredPending;
  const walkFollowUpSignals = queueSignalsForFilter({
    pending: [],
    reviewed: reviewedSignals,
    status: "followup",
    type: typeFilter,
    action: actionFilter,
    supervisedActions,
  }).filtered;
  const customerNames: Record<string, string> = {};
  for (const conversation of queueChats.conversations) {
    const name =
      conversation.customerName?.trim() ||
      customerNameFromExternalId(conversation.externalId);
    if (name) {
      customerNames[conversation.id] = name;
    }
  }

  const hasSyncFailure = shouldShowSyncFailureBanner(syncFailed, store.signals);
  const staleSyncFailedParam = syncFailed > 0 && !hasSyncFailure;

  const queryExtras: Record<string, string | undefined | null> = {
    q: searchQuery || null,
    demo: demo ? "1" : null,
    imported:
      importedCount != null && !Number.isNaN(importedCount)
        ? String(importedCount)
        : null,
    signals:
      newSignalCount != null && !Number.isNaN(newSignalCount)
        ? String(newSignalCount)
        : null,
    replaced: jsonKeepSet ? "1" : null,
    syncFailed: hasSyncFailure ? String(syncFailed) : null,
    syncCreated: hasSyncFailure ? String(syncCreated) : null,
    llmAdded: llmAdded > 0 ? String(llmAdded) : null,
    llmFailed: llmFailed > 0 ? String(llmFailed) : null,
    llmFailure: llmFailed > 0 ? llmFailure : null,
    scoreFrom,
    scoreTo,
    mode: workspaceMode === "action" ? "action" : null,
    file: vaultFile,
    call: callToday ? "today" : null,
  };

  // Prefer Neon Correct when the same id is also JSON-unreviewed pending.
  const previewSignal = resolvePreviewSignal(
    previewId,
    pendingSignals,
    reviewedSignals,
  );
  const previewConversation = previewSignal
    ? (queueChats.conversations.find(
        (conversation) => conversation.id === previewSignal.conversationId,
      ) ?? null)
    : null;
  const previewMessages = previewSignal
    ? queueChats.messages
        .filter(
          (message) => message.conversationId === previewSignal.conversationId,
        )
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    : [];
  const previewCustomerName = previewSignal
    ? resolveCustomerName(
        previewSignal.conversationId,
        customerNames,
        previewSignal.summary || "",
      )
    : null;
  const reviewOpen = Boolean(previewSignal && previewCustomerName != null);
  const unresolvedPreview = Boolean(previewId) && !reviewOpen;
  const breadcrumbPageLabel = (() => {
    if (!previewSignal || previewCustomerName == null) return null;
    const who = previewCustomerName.trim() || "Customer";
    if (who !== "Customer") return who;
    return (
      queueSignalSummary(previewSignal.summary || "", who).trim() ||
      previewSignal.summary?.trim() ||
      "Signal"
    );
  })();
  // Clear `?preview=` while preserving filters / banners / Action Mode.
  const backToQueueHref = viewHref("insights", {
    ...queryExtras,
    status: statusQueryValue(statusFilter, workspaceMode),
    type: typeFilter === "all" ? null : typeFilter,
    action: actionFilter === "all" ? null : actionFilter,
    page: page > 1 ? String(page) : null,
    preview: null,
  });
  const cadenceHref = cadenceActionHref(cadenceAction, {
    scoreFrom,
    scoreTo,
    preview: cadencePreviewId,
    replaced: jsonKeepSet,
  });
  const followUpHref = viewHref("insights", {
    ...queryExtras,
    status: "followup",
  });
  const pendingHref = viewHref("insights", {
    ...queryExtras,
    status: "new",
  });
  const cadenceEmpty = {
    description: pilotCadenceHelperCopy("insights", cadenceAction),
    href: cadenceHref,
    label: cadenceActionCta(cadenceAction),
  };
  const emptyTenant =
    store.tenant.id !== "tenant_demo" &&
    store.conversations.length === 0 &&
    pendingSignals.length === 0 &&
    reviewedSignals.length === 0 &&
    !vaultMismatch;
  // Pending empty next step (mid-week Upload, etc.) — also used when Correct is
  // empty and there is nothing pending to review (same panel copy).
  const pendingClear = emptyTenant
    ? callToday
      ? {
          title: "No calls today",
          description:
            "This tenant has no chats yet. Upload an export, then the Top 10 fills from pending signals. Nothing is sent.",
          href: viewHref("upload"),
          label: "Upload chats",
        }
      : {
          title: "No chats yet",
          description:
            "Upload this week’s export to start. Nothing is sent.",
          href: viewHref("upload"),
          label: "Upload chats",
        }
    : callToday && pendingSignals.length === 0
      ? {
          title: "No calls today",
          description: "No pending signals are ranked for today.",
          href: viewHref("insights", {
            ...queryExtras,
            call: null,
            status: "new",
          }),
          label: "Show the full queue",
        }
      : vaultEmpty
    ? {
        title: vaultEmpty.title,
        description: vaultEmpty.description,
        href: vaultEmpty.href,
        label: vaultEmpty.label,
      }
    : cadenceAction.id === "reviews"
      ? null
      : cadenceEmpty;
  const followUpEmpty = emptyTenant
    ? {
        title: "No chats yet",
        description: "Upload this week’s export to start. Nothing is sent.",
        href: viewHref("upload"),
        label: "Upload chats",
      }
    : vaultEmpty
    ? {
        title: vaultEmpty.title,
        description: vaultEmpty.description,
        href: vaultEmpty.href,
        label: vaultEmpty.label,
      }
    : pendingSignals.length > 0
      ? {
          description: "Review pending detections first.",
          href: pendingHref,
          label: "Review Pending",
        }
      : pendingClear;
  const previewTriage = previewSignal
    ? buildSignalReviewTriage({
        pendingSignals,
        walkPendingSignals,
        previewSignal,
        scoreFrom,
        scoreTo,
        mode: workspaceMode,
        replaced: jsonKeepSet,
        typeFilter,
        actionFilter,
        file: vaultFile,
        page,
        q: searchQuery,
      })
    : null;
  function searchedWalkHref(opts: Parameters<typeof pendingReviewWalkHref>[0]) {
    const href = pendingReviewWalkHref(opts);
    return searchQuery ? `${href}&q=${encodeURIComponent(searchQuery)}` : href;
  }
  const walkHrefOpts = {
    statusFilter,
    typeFilter,
    actionFilter,
    scoreFrom,
    scoreTo,
    mode: workspaceMode,
    replaced: jsonKeepSet,
    file: vaultFile,
    callToday,
    page,
    q: searchQuery,
  };
  // Any open ?preview= while filtered needs-review remains — including after
  // Correct / Mark as Acted (follow-up / Done origin). Hide only when the
  // filtered pending walk is empty. Prev/Next/Skip walk filtered pending
  // (type + action); last Skip → filtered list.
  const pendingWalk =
    previewSignal && walkPendingSignals.length > 0
      ? {
          prevHref: previewTriage?.prevPendingPreviewId
            ? searchedWalkHref({
                ...walkHrefOpts,
                previewId: previewTriage.prevPendingPreviewId,
              })
            : null,
          nextHref: previewTriage?.nextPendingPreviewId
            ? searchedWalkHref({
                ...walkHrefOpts,
                previewId: previewTriage.nextPendingPreviewId,
              })
            : null,
          skipHref: searchedWalkHref({
            ...walkHrefOpts,
            previewId: skipPendingPreviewId(
              walkPendingSignals,
              previewSignal.id,
            ),
          }),
        }
      : null;
  // After Mark as Acted: next Correct panel in the filtered Follow-up set,
  // else next filtered pending review.
  // Origin status filter is unused — empty Pending / Follow-up lists are not a destination.
  const actedWalk = previewSignal
    ? {
        nextPreviewId: nextUnactedCorrectId(
          walkFollowUpSignals,
          previewSignal.id,
        ),
        nextPendingPreviewId: previewTriage?.nextPendingPreviewId ?? null,
        statusFilter,
        typeFilter,
        actionFilter,
        scoreFrom,
        scoreTo,
        mode: workspaceMode,
        replaced: jsonKeepSet,
        file: vaultFile,
        page,
        q: searchQuery,
      }
    : null;
  const openConversationAction =
    previewSignal &&
    previewCustomerName != null &&
    previewMessages.length > 0 ? (
      <OpenConversationHeaderAction
        key={`open-conv-${previewSignal.id}`}
        messages={previewMessages}
        customerName={previewCustomerName}
        typeLabel={signalTypeLabel(previewSignal.type)}
        summary={previewSignal.summary}
      />
    ) : null;
  const weekCounts =
    vaultMismatch || !backendScore
      ? null
      : normalizeSignalScoreCounts(backendScore);
  const scoreAsleep =
    scoreUnavailable && !vaultMismatch && store.conversations.length > 0;
  const scoreRetryHref = viewHref("insights", {
    ...queryExtras,
    status: statusQueryValue(statusFilter, workspaceMode),
    type: typeFilter === "all" ? null : typeFilter,
    action: actionFilter === "all" ? null : actionFilter,
    page: page > 1 ? String(page) : null,
  });

  const importLanding =
    Boolean(vaultEmpty && vaultFile) &&
    importedCount != null &&
    importedCount > 0 &&
    isLivePartnerKeepSet(vaultFile);
  const queueProps = {
    pendingSignals,
    reviewedSignals,
    customerNames,
    conversationsById: previewConversation
      ? { [previewConversation.id]: previewConversation }
      : {},
    messagesByConversationId: previewSignal
      ? { [previewSignal.conversationId]: previewMessages }
      : {},
    queueError,
    tenantSignalsError,
    statusFilter,
    typeFilter,
    actionFilter,
    page,
    queryExtras,
    showFilters: false as const,
    pendingClear,
    followUpEmpty,
    doneEmpty: {
      description:
        "Mark the correct ones as Acted. You run the follow-up in your own tools. Nothing is sent.",
      href: followUpHref,
      label: "Needs Follow-Up",
    },
    reviewTriage: previewTriage ?? undefined,
    actedWalk,
    supervisedActions,
    scoreAsleep,
    landingFile: importLanding ? vaultFile : null,
  };

  const queueBody = (
    <>
      <InsightsQueueMetrics
        conversationCount={
          vaultMismatch ? 0 : queueChats.conversations.length
        }
        signals={[
          ...pendingSignals,
          ...reviewedSignals.filter(
            (signal) =>
              !pendingSignals.some((pending) => pending.id === signal.id),
          ),
        ]}
        pendingSignals={pendingSignals}
        reviewedCount={
          weekCounts ? weekCounts.reviewedCount : vaultMismatch ? 0 : null
        }
        correctCount={weekCounts?.correctCount ?? null}
        scoreWaiting={scoreAsleep}
        retryHref={scoreAsleep ? scoreRetryHref : null}
      />
      <div className="flex min-h-[24rem] min-w-0 flex-1 flex-col gap-4 overflow-hidden md:min-h-0">
        <div className="flex w-full min-w-0 shrink-0 flex-col gap-2">
          <form action="/" method="get" className="flex min-w-0 gap-2">
            <input type="hidden" name="view" value="insights" />
            {Object.entries({ ...queryExtras, status: statusFilter, type: typeFilter, action: actionFilter }).map(([key, value]) =>
              key !== "q" && value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
            <label htmlFor="queue-search" className="sr-only">Search customer turns and signal summaries</label>
            <input id="queue-search" name="q" type="search" maxLength={200} defaultValue={searchQuery}
              placeholder="Search customer turns and summaries…" className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-base focus-visible:ring-2" />
            <button type="submit" className="min-h-11 rounded-md border px-4 focus-visible:ring-2">Search</button>
          </form>
          {searchQuery ? (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {!queueError && !tenantSignalsError && pendingSignals.length + reviewedSignals.length === 0
                ? "No matches. Try another word or clear the search. "
                : "Searching persisted customer turns and signal summaries. "}
              <Link href={viewHref("insights", { ...queryExtras, q: null, status: statusFilter, type: typeFilter, action: actionFilter })}
                className="inline-flex min-h-11 items-center underline focus-visible:ring-2">Clear search</Link>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 text-copy-14 text-sio-fg-subtle">
            <p role="status">{Intl.NumberFormat().format(queueSignalsForFilter({ pending: listPendingSignals, reviewed: reviewedSignals, status: statusFilter, type: typeFilter, action: actionFilter, supervisedActions }).filtered.length)} signals in this filter scope · corpus totals above</p>
            {statusFilter !== "all" || typeFilter !== "all" || actionFilter !== "all" || searchQuery || callToday ? <Link href={viewHref("insights", { ...queryExtras, status: workspaceMode === "action" ? "all" : null, type: null, action: null, q: null, page: null, preview: null, call: null })} scroll={false} className="link-accent inline-flex min-h-11 items-center">Clear filters</Link> : null}
          </div>
          <SignalQueueFilters
            pendingSignals={pendingSignals}
            reviewedSignals={reviewedSignals}
            queueError={queueError}
            statusFilter={statusFilter}
            typeFilter={typeFilter}
            actionFilter={actionFilter}
            page={page}
            previewId={null}
            queryExtras={queryExtras}
            supervisedActions={store.supervisedActions ?? []}
            callToday={callToday}
          />
        </div>
        <SignalQueue
          {...queueProps}
          pendingSignals={listPendingSignals}
          previewId={null}
        />
      </div>
    </>
  );

  return (
    <ViewFrame className="gap-4">
      {resolveVaultShowcaseKind(vaultFile ?? store.pilot?.lastUploadedFileName) ? <DemoWalkthrough key={vaultFile ?? store.pilot?.lastUploadedFileName} reportHref={viewHref("report", { file: vaultFile ?? store.pilot?.lastUploadedFileName, scoreFrom, scoreTo })} /> : null}
      {llmFailure === "budget" && (
        <p role="status" aria-live="polite" className="break-words text-body-14 text-sio-fg-base">
          AI paused — ask an admin to check the limits, then re-run detection. Existing signals remain available.
        </p>
      )}
      <VaultKeepSetRefresh
        active={Boolean(vaultEmpty) || landingChats}
        fileName={vaultFile ?? store.pilot?.lastUploadedFileName ?? ""}
      />
      <CanonicalizeInsightsStatus
        statusFilter={statusFilter}
        workspaceMode={workspaceMode}
        statusOmitted={statusOmitted}
        unresolvedPreview={unresolvedPreview}
      />
      <ClearStaleSyncFailedParams shouldClear={staleSyncFailedParam} />

      <InsightsModeSwap
        mode={reviewOpen ? "review" : "list"}
        reviewKey={reviewOpen ? previewId : null}
        list={
          <div className="flex min-h-full min-w-0 flex-col gap-4 md:h-full md:min-h-0 md:flex-1">
            <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 className="min-w-0 flex-1 basis-[min(100%,16rem)] scroll-mt-4 text-balance text-heading-20 text-sio-fg-base">
                Conversation that needs your attention
              </h2>
              <div className="flex flex-wrap items-center gap-2">
              <Link href={viewHref("report", { file:vaultFile, scoreFrom, scoreTo })} className="inline-flex min-h-11 items-center text-sm underline">Open scoped revenue report</Link>
              <Link
                href={viewHref("upload")}
                className="btn-secondary shrink-0 rounded-[var(--radius-panel)] min-h-11 md:!h-9 md:min-h-0 !px-3.5"
              >
                <ArrowCircleUpIcon className="size-3.5 shrink-0" />
                Upload & Detect
              </Link>
              </div>
            </div>
            {vaultShowcaseKind && vaultFile ? (
              <VaultShowcaseLoader
                fileName={vaultFile}
                keepSetFileName={store.pilot?.lastUploadedFileName}
              >
                {queueBody}
              </VaultShowcaseLoader>
            ) : (
              queueBody
            )}
          </div>
        }
        review={
          <ConversationDrawerControlProvider
            key={previewSignal?.id ?? "no-preview"}
          >
            <div className="flex min-h-full min-w-0 flex-col gap-4 md:h-full md:min-h-0 md:flex-1">
              <div className="sticky top-0 z-10 flex min-w-0 shrink-0 flex-col gap-3 bg-sio-bg-muted min-[540px]:flex-row min-[540px]:items-center min-[540px]:justify-between min-[540px]:gap-4">
                <div className="min-w-0 min-[540px]:flex-1">
                  {breadcrumbPageLabel ? (
                    <Breadcrumb
                      aria-label="Insights review"
                      className="min-w-0 scroll-mt-4"
                    >
                      <BreadcrumbList className="min-w-0 flex-nowrap gap-1.5 sm:gap-1.5">
                        <BreadcrumbItem className="shrink-0">
                          <BreadcrumbLink asChild>
                            <Link
                              href={backToQueueHref}
                              scroll={false}
                              className="inline-flex min-h-6 items-center touch-manipulation"
                            >
                              Insights Queue
                            </Link>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator className="shrink-0" />
                        <BreadcrumbItem className="min-w-0">
                          <BreadcrumbPage
                            className="block min-w-0 truncate text-heading-16 font-medium !text-sio-fg-base"
                            title={breadcrumbPageLabel}
                            translate="no"
                          >
                            {breadcrumbPageLabel}
                          </BreadcrumbPage>
                        </BreadcrumbItem>
                      </BreadcrumbList>
                    </Breadcrumb>
                  ) : (
                    <h2 className="scroll-mt-4 text-balance text-heading-20 text-sio-fg-base">
                      Insights Queue
                    </h2>
                  )}
                </div>
                <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 min-[540px]:w-auto">
                  {previewSignal && previewCustomerName != null ? (
                    <>
                      {pendingWalk ? (
                        <ReviewWalkHeader
                          prevHref={pendingWalk.prevHref}
                          nextHref={pendingWalk.nextHref}
                          skipHref={pendingWalk.skipHref}
                          openConversation={openConversationAction}
                        />
                      ) : (
                        openConversationAction
                      )}
                      <MarkActedHeaderAction
                        key={previewSignal.id}
                        signal={previewSignal}
                        {...(actedWalk ?? {})}
                      />
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <SignalQueue
                  {...queueProps}
                  pendingSignals={listPendingSignals}
                  previewId={previewId}
                />
              </div>
            </div>
          </ConversationDrawerControlProvider>
        }
      />
    </ViewFrame>
  );
}
