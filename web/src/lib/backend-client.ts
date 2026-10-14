/**
 * Server-side client for the FastAPI Signal Score service.
 * Signal Score source of truth is Neon via this API; JSON store is a local mirror.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import {
  actorUserId,
  DEMO_ACTOR_EMAIL,
  signActorAssertion,
} from "./actor-assertion";
import {
  publicDemoEnabled,
  SESSION_COOKIE,
  verifySessionToken,
} from "./auth-token";
import { DEMO_TENANT_ID } from "./tenant-context";
import { getStateMode } from "./state-mode";

const DEFAULT_BACKEND_URL = "http://localhost:8000";

/**
 * Fail hung FastAPI calls so dual-write retries can proceed.
 * Neon round-trips (especially writes) often land in the 3–8s range; 5s
 * aborted Correct/Incorrect before FastAPI logged the POST.
 */
export const BACKEND_FETCH_TIMEOUT_MS = 10_000;
/** createPrediction / submitFeedback — Neon commits can exceed read latency. */
export const BACKEND_MUTATION_TIMEOUT_MS = 15_000;
/** Render free cold-start /health — first request often exceeds the 10s read budget. */
export const BACKEND_HEALTH_TIMEOUT_MS = 25_000;
const MUTATION_RETRY_BACKOFF_MS = [250, 800] as const;
const MUTATION_MAX_ATTEMPTS = 2;

export const VERCEL_BACKEND_MISCONFIG_MESSAGE =
  "BACKEND_URL unset or localhost on Vercel — set Production BACKEND_URL to the public FastAPI base URL";

function isLoopbackBackendUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

function combineAbortSignals(
  ...signals: AbortSignal[]
): AbortSignal {
  if (signals.length === 1) return signals[0];
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(signals);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

function createTimeoutSignal(ms: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

export type BackendFeedbackLabel =
  | "correct"
  | "incorrect"
  | "partially_correct";

export interface BackendPrediction {
  active?: boolean;
  id: string;
  tenant_id: string;
  conversation_id: string;
  signal_type: string;
  confidence: number;
  summary: string;
  urgency?: "high" | "medium" | "low" | null;
  urgency_timeframe?: string | null;
  mentioned_value_inr?: number | null;
  commercial_value_evidence?: { message_id: string; quote: string; amount_inr: number; category: "asset" | "revenue_opportunity" | "unconfirmed" }[] | null;
  created_at: string;
  /** Present after 004; treat missing as false (fail-soft). */
  acted?: boolean;
  outcome?: string | null;
  outcome_value_inr?: number | null;
  outcome_recorded_at?: string | null;
  evidence_status?: "valid" | "unresolved" | "stale" | null;
  evidence_reason?: string | null;
  evidence_spans?:
    | {
        message_id: string;
        start: number;
        end: number;
        quote?: string | null;
      }[]
    | null;
}

export interface BackendPredictionWithFeedback extends BackendPrediction {
  feedback: BackendFeedback | null;
}

export interface BackendFeedback {
  id: string;
  tenant_id: string;
  signal_id: string;
  feedback: BackendFeedbackLabel;
  note: string | null;
  reviewed_by: string;
  reviewed_at: string;
}

export interface BackendSignalScoreByType {
  signal_type: string;
  signal_score: number | null;
  reviewed_count: number;
  correct_count: number;
  incorrect_count: number;
  partially_correct_count: number;
}

export interface BackendSignalScore {
  tenant_id: string;
  signal_score: number | null;
  reviewed_count: number;
  correct_count: number;
  incorrect_count: number;
  partially_correct_count: number;
  by_signal_type: BackendSignalScoreByType[];
  /** Earliest in-slice ``reviewed_at``. Omitted or null when the window is empty. */
  first_reviewed_at?: string | null;
  /** Latest in-slice ``reviewed_at``. Omitted or null when the window is empty. */
  last_reviewed_at?: string | null;
  revenue_at_risk_found_inr?: number;
  revenue_saved_inr?: number;
}

export class BackendClientError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "BackendClientError";
  }
}

export function getBackendUrl(): string {
  const fromEnv = process.env.BACKEND_URL?.trim();
  return (fromEnv || DEFAULT_BACKEND_URL).replace(/\/$/, "");
}

/**
 * On Vercel, refuse unset/localhost BACKEND_URL so demos fail loudly
 * instead of timing out against the laptop default.
 */
export function assertBackendUrlConfigured(): string {
  const fromEnv = process.env.BACKEND_URL?.trim();
  const url = getBackendUrl();
  if (process.env.VERCEL && (!fromEnv || isLoopbackBackendUrl(url))) {
    throw new BackendClientError(VERCEL_BACKEND_MISCONFIG_MESSAGE);
  }
  return url;
}

type BackendFetchInit = RequestInit & { timeoutMs?: number };

function isRetryableBackendError(err: unknown): boolean {
  if (!(err instanceof BackendClientError)) return false;
  if (err.status == null) return true;
  return err.status >= 500;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const COLD_START_STATUSES = new Set([502, 503, 504]);

function serviceTokenHeader(): Record<string, string> {
  const token = process.env.SIOONA_SERVICE_TOKEN?.trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

type ActorAuthMode = "off" | "shadow" | "enforce";

type ActorIdentity = { sub: string; tid: string };

const actorIdentity = new AsyncLocalStorage<ActorIdentity>();

/** Bind a named service principal for the FastAPI calls inside `fn`. */
export function runWithServicePrincipal<T>(
  principal: string,
  tenantId: string,
  fn: () => T,
): T {
  return actorIdentity.run({ sub: principal, tid: tenantId }, fn);
}

function actorAuthMode(): ActorAuthMode {
  const mode = process.env.SIOONA_ACTOR_AUTH;
  if (mode === "shadow" || mode === "enforce") return mode;
  return "off";
}

function actorScopedPath(tenantId: string, path: string): string {
  if (actorAuthMode() === "off") return path;
  const queryAt = path.indexOf("?");
  const pathname = queryAt === -1 ? path : path.slice(0, queryAt);
  const query = queryAt === -1 ? "" : path.slice(queryAt);
  const alias =
    pathname === "/v1/conversations" ||
    pathname === "/v1/conversations/bulk" ||
    pathname === "/v1/predictions" ||
    pathname === "/v1/predictions/bulk" ||
    pathname === "/v1/supervised-actions" ||
    /^\/v1\/signals\/[^/]+\/(?:feedback|acted|outcome)$/.test(pathname);
  if (!alias) return path;
  return `/v1/tenants/${encodeURIComponent(tenantId)}${pathname.slice(3)}${query}`;
}

async function resolveActor(tenantId: string): Promise<ActorIdentity | null> {
  const bound = actorIdentity.getStore();
  if (bound) return bound;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
    if (session) {
      return { sub: actorUserId(session.email), tid: tenantId };
    }
  } catch {
    // Tests and non-request calls have no cookie store.
  }
  if (tenantId === DEMO_TENANT_ID && publicDemoEnabled()) {
    return { sub: actorUserId(DEMO_ACTOR_EMAIL), tid: DEMO_TENANT_ID };
  }
  return null;
}

async function actorRequestHeaders(
  tenantId: string,
): Promise<Record<string, string>> {
  if (actorAuthMode() === "off") return {};
  const key = process.env.SIOONA_ACTOR_KEY?.trim() ?? "";
  const actor = await resolveActor(tenantId);
  if (!key || !actor) return {};
  return { "X-Sioona-Actor": signActorAssertion(actor.sub, actor.tid, key) };
}

function callerHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  const extra: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      extra[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) extra[key] = value;
  } else if (headers) {
    Object.assign(extra, headers);
  }
  // Shadow observes actor authorization but still uses the legacy admin gate.
  if (actorAuthMode() === "enforce") delete extra["X-Sioona-Role"];
  return extra;
}

async function backendFetchOnce<T>(
  tenantId: string,
  path: string,
  init: BackendFetchInit | undefined,
  timeoutMs: number,
): Promise<T> {
  const url = `${assertBackendUrlConfigured()}${path}`;
  const { timeoutMs: _ignored, signal: userSignal, ...rest } = init ?? {};
  const { signal: timeoutSignal, clear: clearTimeoutSignal } =
    createTimeoutSignal(timeoutMs);
  const signal = userSignal
    ? combineAbortSignals(userSignal, timeoutSignal)
    : timeoutSignal;

  let response: Response;
  const minted =
    actorAuthMode() === "off" ? {} : await actorRequestHeaders(tenantId);
  try {
    response = await fetch(url, {
      ...rest,
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": tenantId,
        ...serviceTokenHeader(),
        ...minted,
        ...callerHeaders(rest.headers),
      },
      cache: "no-store",
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const detail =
      name === "AbortError"
        ? `timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : "network error";
    throw new BackendClientError(`Signal Score backend unreachable: ${detail}`);
  } finally {
    clearTimeoutSignal();
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string; error?: string };
      detail = body.detail ?? body.error ?? detail;
    } catch {
      // keep statusText
    }
    throw new BackendClientError(detail, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function backendFetch<T>(
  tenantId: string,
  path: string,
  init?: BackendFetchInit
): Promise<T> {
  const scopedPath = actorScopedPath(tenantId, path);
  const timeoutMs = init?.timeoutMs ?? BACKEND_FETCH_TIMEOUT_MS;
  try {
    return await backendFetchOnce(tenantId, scopedPath, init, timeoutMs);
  } catch (err) {
    // One extra wait for Render free-tier wake. Timeouts stay on the caller.
    if (
      !(err instanceof BackendClientError) ||
      err.status == null ||
      !COLD_START_STATUSES.has(err.status)
    ) {
      throw err;
    }
    await sleep(1000);
    try {
      return await backendFetchOnce(
        tenantId,
        scopedPath,
        init,
        Math.max(timeoutMs, 25_000),
      );
    } catch (retryErr) {
      if (
        retryErr instanceof BackendClientError &&
        retryErr.status != null &&
        COLD_START_STATUSES.has(retryErr.status)
      ) {
        throw new BackendClientError(
          "Signal Score is waking up after a cold start. Retry in a moment.",
          retryErr.status,
        );
      }
      throw retryErr;
    }
  }
}

export type BackendMessageRole = "customer" | "agent" | "system";

export type BackendGroundTruth = "lead" | "retention" | "upsell" | "none";

export interface BackendConversationMessageInput {
  message_id: string;
  role: BackendMessageRole;
  content: string;
  timestamp: string;
}

export interface BackendConversationInput {
  conversation_id: string;
  channel: string;
  customer_name?: string | null;
  started_at: string;
  external_id?: string | null;
  ground_truth?: BackendGroundTruth | null;
  clear_ground_truth?: boolean;
  messages: BackendConversationMessageInput[];
}

export interface BackendMessage {
  id: string;
  tenant_id: string;
  conversation_id: string;
  message_id: string;
  role: string;
  content: string;
  timestamp: string;
  created_at: string;
}

export interface BackendConversation {
  id: string;
  tenant_id: string;
  conversation_id: string;
  channel: string;
  customer_name: string | null;
  started_at: string;
  external_id: string | null;
  ground_truth?: BackendGroundTruth | null;
  created_at: string;
  updated_at: string;
  messages: BackendMessage[];
}

export interface BackendConversationBulkResult {
  conversations: BackendConversation[];
  created: number;
  updated: number;
  messages_created: number;
  messages_updated: number;
}

/** Bulk chat+message upserts are larger than single predictions (pilot ~100). */
/** Weekly hydrate list. The default 10s fetch drops a pack that is still large. */
export const HYDRATE_CONVERSATIONS_TIMEOUT_MS = 25_000;

export const BACKEND_BULK_CONVERSATION_TIMEOUT_MS = 90_000;

export async function upsertConversations(
  tenantId: string,
  conversations: BackendConversationInput[]
): Promise<BackendConversationBulkResult> {
  return backendFetch<BackendConversationBulkResult>(
    tenantId,
    "/v1/conversations/bulk",
    {
      method: "POST",
      body: JSON.stringify({ conversations }),
      timeoutMs: BACKEND_BULK_CONVERSATION_TIMEOUT_MS,
    }
  );
}

export async function upsertConversation(
  tenantId: string,
  conversation: BackendConversationInput
): Promise<BackendConversation> {
  return backendFetch<BackendConversation>(tenantId, "/v1/conversations", {
    method: "POST",
    body: JSON.stringify(conversation),
    timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
  });
}

export async function patchConversationGroundTruth(
  tenantId: string,
  conversationId: string,
  groundTruth: BackendGroundTruth | null
): Promise<BackendConversation> {
  const path = `/v1/tenants/${encodeURIComponent(
    tenantId
  )}/conversations/${encodeURIComponent(conversationId)}`;
  return backendFetch<BackendConversation>(tenantId, path, {
    method: "PATCH",
    body: JSON.stringify({ ground_truth: groundTruth }),
    timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
  });
}

export async function createPrediction(
  tenantId: string,
  input: {
    conversation_id: string;
    signal_type: string;
    confidence: number;
    summary: string;
    urgency?: "high" | "medium" | "low";
    urgency_timeframe?: string;
    mentioned_value_inr?: number;
  }
): Promise<BackendPrediction> {
  return backendFetch<BackendPrediction>(tenantId, "/v1/predictions", {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
  });
}

/** Bulk prediction upserts — Partner Demo / ingest (~50–100 signals). */
export const BACKEND_BULK_PREDICTION_TIMEOUT_MS = 60_000;

export type BackendPredictionBulkResult = {
  predictions: BackendPrediction[];
  created: number;
  updated: number;
};

export async function createPredictionsBulk(
  tenantId: string,
  predictions: Array<{
    conversation_id: string;
    signal_type: string;
    confidence: number;
    summary: string;
    urgency?: "high" | "medium" | "low";
    urgency_timeframe?: string;
    mentioned_value_inr?: number;
  }>
): Promise<BackendPredictionBulkResult> {
  return backendFetch<BackendPredictionBulkResult>(
    tenantId,
    "/v1/predictions/bulk",
    {
      method: "POST",
      body: JSON.stringify({ predictions }),
      timeoutMs: BACKEND_BULK_PREDICTION_TIMEOUT_MS,
    }
  );
}

export async function submitFeedback(
  tenantId: string,
  signalId: string,
  input: {
    feedback: BackendFeedbackLabel;
    reviewed_by: string;
    note?: string;
    /** Original review time. Honored only when `if_absent` inserts a new row. */
    reviewed_at?: string;
    /** Insert when Neon has no feedback. Never overwrite an existing label. */
    if_absent?: boolean;
  }
): Promise<BackendFeedback> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MUTATION_MAX_ATTEMPTS; attempt++) {
    try {
      return await backendFetch<BackendFeedback>(
        tenantId,
        `/v1/signals/${signalId}/feedback`,
        {
          method: "POST",
          body: JSON.stringify(input),
          timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
        }
      );
    } catch (err) {
      lastError = err;
      if (
        !isRetryableBackendError(err) ||
        attempt >= MUTATION_MAX_ATTEMPTS - 1
      ) {
        break;
      }
      const delay =
        MUTATION_RETRY_BACKOFF_MS[
          Math.min(attempt, MUTATION_RETRY_BACKOFF_MS.length - 1)
        ] ?? MUTATION_RETRY_BACKOFF_MS[MUTATION_RETRY_BACKOFF_MS.length - 1];
      await sleep(delay);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new BackendClientError("Failed to save feedback to Signal Score backend");
}

/** Liveness probe — used to wake Render before Insights/Eval refresh. */
export async function getBackendHealth(): Promise<{ status: string }> {
  return backendFetch<{ status: string }>("tenant_demo", "/health", {
    timeoutMs: BACKEND_HEALTH_TIMEOUT_MS,
  });
}

export async function getSignalScore(
  tenantId: string,
  opts?: {
    date_from?: string;
    date_to?: string;
    signal_type?: string;
    upload_id?: string;
    /** JSON store conversation ids. Empty array is an explicit keep-set (0 reviewed). */
    conversationIds?: string[];
  }
): Promise<BackendSignalScore> {
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/signal-score`;
  if (opts?.conversationIds !== undefined) {
    const body: {
      conversation_ids: string[];
      date_from?: string;
      date_to?: string;
      signal_type?: string;
      upload_id?: string;
    } = { conversation_ids: opts.conversationIds };
    if (opts.date_from) body.date_from = opts.date_from;
    if (opts.date_to) body.date_to = opts.date_to;
    if (opts.upload_id) body.upload_id = opts.upload_id;
    if (opts.signal_type) body.signal_type = opts.signal_type;
    return backendFetch<BackendSignalScore>(tenantId, path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  const params = new URLSearchParams();
  if (opts?.date_from) params.set("date_from", opts.date_from);
  if (opts?.date_to) params.set("date_to", opts.date_to);
  if (opts?.signal_type) params.set("signal_type", opts.signal_type);
  if (opts?.upload_id) params.set("upload_id", opts.upload_id);
  const qs = params.toString();
  return backendFetch<BackendSignalScore>(
    tenantId,
    qs ? `${path}?${qs}` : path
  );
}

/** Repeat `conversation_id`. Empty / blank → explicit empty keep-set, not the full tenant. */
function appendKeepSetConversationIds(
  params: URLSearchParams,
  conversationIds: string[] | undefined
): void {
  if (conversationIds === undefined) return;
  if (conversationIds.length === 0) {
    params.append("conversation_id", "");
    return;
  }
  for (const id of conversationIds) {
    if (id) params.append("conversation_id", id);
  }
  if (!params.has("conversation_id")) {
    params.append("conversation_id", "");
  }
}

export async function getNeedsReview(
  tenantId: string,
  opts?: {
    limit?: number;
    offset?: number;
    /** Active keep-set. Empty array → no rows. Omitted → unfiltered page. */
    conversationIds?: string[];
  }
): Promise<BackendPrediction[]> {
  const params = new URLSearchParams();
  params.set("limit", String(opts?.limit ?? 20));
  if (opts?.offset && opts.offset > 0) {
    params.set("offset", String(opts.offset));
  }
  appendKeepSetConversationIds(params, opts?.conversationIds);
  const path = `/v1/tenants/${encodeURIComponent(
    tenantId
  )}/signals/needs-review?${params.toString()}`;
  return backendFetch<BackendPrediction[]>(tenantId, path);
}

export async function getConversations(
  tenantId: string,
  opts?: {
    /** Insights overlay keep-set. Empty array → no rows (not the full tenant). */
    conversationIds?: string[];
    /** ISO timestamp. Only rows updated at or after this instant. */
    updatedSince?: string;
    timeoutMs?: number;
  }
): Promise<BackendConversation[]> {
  const params = new URLSearchParams();
  appendKeepSetConversationIds(params, opts?.conversationIds);
  const since = opts?.updatedSince?.trim();
  if (since) params.set("updated_since", since);
  const qs = params.toString();
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/conversations${
    qs ? `?${qs}` : ""
  }`;
  return backendFetch<BackendConversation[]>(tenantId, path, {
    ...(opts?.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  });
}

export interface BackendConversationPruneResult {
  deleted: number;
  kept: number;
}

export async function pruneConversations(
  tenantId: string,
  keepConversationIds: string[]
): Promise<BackendConversationPruneResult> {
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/conversations/prune`;
  return backendFetch<BackendConversationPruneResult>(tenantId, path, {
    method: "POST",
    body: JSON.stringify({ keep_conversation_ids: keepConversationIds }),
    timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
  });
}

export type BackendSupervisedActionType =
  | "lead_outreach_draft"
  | "upsell_note_draft"
  | "retention_email_draft"
  | "retention_followup_draft";

export type BackendSupervisedActionStatus = "approved" | "edited" | "dismissed";

export interface BackendSupervisedActionDecision {
  id: string;
  tenant_id: string;
  conversation_id: string;
  action_type: BackendSupervisedActionType;
  status: BackendSupervisedActionStatus;
  subject: string;
  body: string;
  evidence_quote: string;
  created_at: string;
  decided_at: string;
}

export async function upsertSupervisedActionDecision(
  tenantId: string,
  input: {
    conversation_id: string;
    action_type: BackendSupervisedActionType;
    status: BackendSupervisedActionStatus;
    subject: string;
    body: string;
    evidence_quote: string;
    decided_at?: string;
  }
): Promise<BackendSupervisedActionDecision> {
  return backendFetch<BackendSupervisedActionDecision>(
    tenantId,
    "/v1/supervised-actions",
    {
      method: "POST",
      body: JSON.stringify(input),
      timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
    }
  );
}

export async function getSupervisedActionDecisions(
  tenantId: string,
  opts?: {
    /** Active keep-set. Empty array → no rows. Omitted → full tenant. */
    conversationIds?: string[];
  }
): Promise<BackendSupervisedActionDecision[]> {
  const params = new URLSearchParams();
  appendKeepSetConversationIds(params, opts?.conversationIds);
  const qs = params.toString();
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/supervised-actions${
    qs ? `?${qs}` : ""
  }`;
  return backendFetch<BackendSupervisedActionDecision[]>(tenantId, path);
}

export async function getTenantSignals(
  tenantId: string,
  opts?: {
    /** Active keep-set. Empty array → no rows. Omitted → full tenant (hydrate). */
    conversationIds?: string[];
  }
): Promise<BackendPredictionWithFeedback[]> {
  const params = new URLSearchParams();
  appendKeepSetConversationIds(params, opts?.conversationIds);
  const qs = params.toString();
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/signals${
    qs ? `?${qs}` : ""
  }`;
  return backendFetch<BackendPredictionWithFeedback[]>(tenantId, path);
}

export async function setPredictionActed(
  tenantId: string,
  signalId: string,
  acted: boolean
): Promise<BackendPredictionWithFeedback> {
  return backendFetch<BackendPredictionWithFeedback>(
    tenantId,
    `/v1/signals/${signalId}/acted`,
    {
      method: "POST",
      body: JSON.stringify({ acted }),
      timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
    }
  );
}

export interface BackendPilotSettings {
  id: string;
  tenant_id: string;
  baseline_opportunities: number;
  baseline_note: string | null;
  weekly_export_count: number | null;
  last_uploaded_file_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendPilotSettingsInput {
  baseline_opportunities: number;
  baseline_note?: string | null;
  weekly_export_count?: number | null;
  last_uploaded_file_name?: string | null;
  update_scope?: "all" | "baseline" | "upload";
}

/**
 * Fetch tenant pilot settings. Returns null when no row exists (404).
 */
export async function getPilotSettings(
  tenantId: string
): Promise<BackendPilotSettings | null> {
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/pilot`;
  try {
    return await backendFetch<BackendPilotSettings>(tenantId, path);
  } catch (err) {
    if (err instanceof BackendClientError && err.status === 404 &&
        (getStateMode() !== "postgres" || err.message === "pilot_settings_not_found")) {
      return null;
    }
    throw err;
  }
}

export interface BackendDetectionResume {
  tenant_id: string;
  failed_conversation_ids: string[];
  skipped_conversation_ids: string[];
  updated_at: string;
}

/** Tenant-scoped chats still waiting after a capped or failed detection run. */
export async function getDetectionResume(
  tenantId: string,
): Promise<BackendDetectionResume | null> {
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/detection-resume`;
  try {
    return await backendFetch<BackendDetectionResume>(tenantId, path);
  } catch (err) {
    if (err instanceof BackendClientError && err.status === 404 &&
        (getStateMode() !== "postgres" || err.message === "detection_resume_not_found")) return null;
    throw err;
  }
}

export async function putDetectionResume(
  tenantId: string,
  input: {
    failed_conversation_ids: string[];
    skipped_conversation_ids: string[];
    expected_updated_at?: string;
  },
): Promise<BackendDetectionResume> {
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/detection-resume`;
  return backendFetch<BackendDetectionResume>(tenantId, path, {
    method: "PUT",
    body: JSON.stringify({
      failed_conversation_ids: input.failed_conversation_ids,
      skipped_conversation_ids: input.skipped_conversation_ids,
      ...(input.expected_updated_at
        ? { expected_updated_at: input.expected_updated_at }
        : {}),
    }),
    timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
  });
}

export async function putPilotSettings(
  tenantId: string,
  input: BackendPilotSettingsInput
): Promise<BackendPilotSettings> {
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/pilot`;
  return backendFetch<BackendPilotSettings>(tenantId, path, {
    method: "PUT",
    body: JSON.stringify({
      baseline_opportunities: Math.max(
        0,
        Math.floor(input.baseline_opportunities)
      ),
      baseline_note: input.baseline_note ?? null,
      weekly_export_count:
        input.weekly_export_count == null
          ? null
          : Math.max(0, Math.floor(input.weekly_export_count)),
      last_uploaded_file_name: input.last_uploaded_file_name ?? null,
      ...(input.update_scope ? { update_scope: input.update_scope } : {}),
    }),
    timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
  });
}

export interface BackendTenantDataWipeResult {
  conversations: number;
  messages: number;
  predictions: number;
  feedback: number;
  pilot_settings: number;
  taxonomy_overrides?: number;
  supervised_actions?: number;
  inference_attempts?: number;
}

/**
 * Delete all Neon rows for this tenant (chats, messages, predictions,
 * feedback, pilot_settings). Reset Demo / Partner Demo / partner deletion only.
 */
export async function wipeTenantData(
  tenantId: string
): Promise<BackendTenantDataWipeResult> {
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/data`;
  return backendFetch<BackendTenantDataWipeResult>(tenantId, path, {
    method: "DELETE",
    timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
    headers: { "X-Sioona-Role": "admin" },
  });
}

export type BackendSignalOutcome =
  | "retained"
  | "churned"
  | "converted"
  | "no_change"
  | "unknown";

export async function setPredictionOutcome(
  tenantId: string,
  signalId: string,
  input: {
    outcome: BackendSignalOutcome;
    value_inr?: number | null;
    recorded_on?: string | null;
  },
): Promise<BackendPrediction> {
  return backendFetch<BackendPrediction>(
    tenantId,
    `/v1/signals/${encodeURIComponent(signalId)}/outcome`,
    {
      method: "POST",
      body: JSON.stringify(input),
      timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
    },
  );
}

export interface BackendTaxonomyTypeOverride {
  phrases: string[];
  keywords: string[];
  negative_phrases: string[];
}

export async function getTaxonomyOverrides(
  tenantId: string,
): Promise<Record<string, BackendTaxonomyTypeOverride>> {
  const body = await backendFetch<{
    overrides: Record<string, BackendTaxonomyTypeOverride>;
  }>(tenantId, `/v1/tenants/${encodeURIComponent(tenantId)}/taxonomy-overrides`, {
    timeoutMs: 4_000,
  });
  return body.overrides ?? {};
}

export async function putTaxonomyOverrides(
  tenantId: string,
  overrides: Record<string, BackendTaxonomyTypeOverride>,
  options?: { merge: boolean },
): Promise<void> {
  await backendFetch(
    tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/taxonomy-overrides${options?.merge ? "?merge=true" : ""}`,
    {
      method: "PUT",
      body: JSON.stringify({
        lead: overrides.lead ?? null,
        retention: overrides.retention ?? null,
        upsell: overrides.upsell ?? null,
      }),
      timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
    },
  );
}

export interface BackendUpload {
  tenant_id: string;
  upload_id: string;
  source: string;
  content_sha256: string;
  status: "staged" | "completed" | "failed";
  imported_at: string;
}

export async function publishUpload(
  tenantId: string,
  uploadId: string,
  input: { source: string; content_sha256: string; conversation_ids: string[]; replace: boolean },
): Promise<BackendUpload> {
  return backendFetch<BackendUpload>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/uploads/${encodeURIComponent(uploadId)}`, {
      method: "PUT", body: JSON.stringify(input), timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
    });
}

export interface BackendUploadMembership {
  upload: BackendUpload;
  conversation_ids: string[];
}

export async function getUploadMembership(tenantId: string, uploadId: string): Promise<BackendUploadMembership> {
  return backendFetch<BackendUploadMembership>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/uploads/${encodeURIComponent(uploadId)}`, { method: "GET" });
}

export interface BackendUploadSnapshot {
  upload: BackendUpload;
  run_id: string;
  conversations: BackendConversationInput[];
  detections: BackendDetectionInput[];
  predictions: BackendPredictionWithFeedback[];
}

export async function getUploadSnapshot(tenantId: string, uploadId: string): Promise<BackendUploadSnapshot> {
  return backendFetch<BackendUploadSnapshot>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/uploads/${encodeURIComponent(uploadId)}/snapshot`, { method: "GET" });
}

export async function getActiveUploads(tenantId: string): Promise<BackendUploadMembership[]> {
  return backendFetch<BackendUploadMembership[]>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/uploads`, { method: "GET" });
}

export interface BackendDetectionInput {
  conversation_id: string; content_hash: string; model_version: string; prompt_version: string;
  coverage?: { included_turns: number; omitted_turns: number; truncated: boolean; token_upper_bound: number; token_budget: number };
  output: { signal_type: string; confidence: number; summary: string; evidence: string[]; urgency?: "high" | "medium" | "low"; urgency_timeframe?: string; mentioned_value_inr?: number }[];
}
export async function publishDetectionRun(tenantId: string, runId: string, conversations: BackendDetectionInput[]) {
  return backendFetch<{ run_id: string; predictions: { id: string; conversation_id: string; signal_type: string; active: boolean }[] }>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/detection-runs/${encodeURIComponent(runId)}`, {
      method: "POST", body: JSON.stringify({ conversations }), timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
    });
}

export async function preflightInferenceLedger(
  tenantId: string
): Promise<{ ok: boolean }> {
  return backendFetch<{ ok: boolean }>(
    tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/inference-attempts/preflight`,
    { method: "GET", timeoutMs: BACKEND_FETCH_TIMEOUT_MS }
  );
}

export type BackendInferenceAttemptIn = {
  attempt_id: string;
  logical_operation_id: string;
  attempt_ordinal: number;
  tenant_id: string;
  conversation_id?: string;
  detection_run_id?: string;
  job_id?: string;
  stage: string;
  route_version: string;
  provider: string;
  model: string;
  prompt_version: string;
  status: string;
  error_category?: string;
  http_status?: number;
  provider_request_id?: string;
  usage_status: string;
  input_tokens?: number | null;
  cached_input_tokens?: number | null;
  output_tokens?: number | null;
  reasoning_tokens?: number | null;
  latency_ms?: number | null;
  started_at: string;
  finished_at?: string | null;
};

export async function flushInferenceAttempts(
  tenantId: string,
  attempts: import("./ai/types").InferenceAttempt[]
): Promise<{ accepted: number; inserted: number; unchanged: number }> {
  const body: { attempts: BackendInferenceAttemptIn[] } = {
    attempts: attempts.map((row) => ({
      attempt_id: row.attemptId,
      logical_operation_id: row.logicalOperationId,
      attempt_ordinal: row.attemptOrdinal,
      tenant_id: row.tenantId,
      ...(row.conversationId ? { conversation_id: row.conversationId } : {}),
      ...(row.detectionRunId ? { detection_run_id: row.detectionRunId } : {}),
      stage: row.stage,
      route_version: row.routeVersion,
      provider: row.provider,
      model: row.model,
      prompt_version: row.promptVersion,
      status: row.status,
      ...(row.errorCategory ? { error_category: row.errorCategory } : {}),
      ...(row.httpStatus != null ? { http_status: row.httpStatus } : {}),
      ...(row.providerRequestId
        ? { provider_request_id: row.providerRequestId }
        : {}),
      usage_status: row.usage.status,
      ...(row.usage.status === "reported"
        ? {
            input_tokens: row.usage.inputTokens,
            cached_input_tokens: row.usage.cachedInputTokens,
            output_tokens: row.usage.outputTokens,
            reasoning_tokens: row.usage.reasoningTokens,
          }
        : {}),
      latency_ms: row.latencyMs,
      started_at: row.startedAt,
      finished_at: row.finishedAt,
    })),
  };
  return backendFetch<{
    accepted: number;
    inserted: number;
    unchanged: number;
  }>(tenantId, `/v1/tenants/${encodeURIComponent(tenantId)}/inference-attempts`, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
  });
}

export async function getInferenceUsage(
  tenantId: string,
  opts: {
    from: string;
    to: string;
    groupBy?: "day" | "model" | "stage" | "run";
  }
) {
  const params = new URLSearchParams({
    from: opts.from,
    to: opts.to,
    group_by: opts.groupBy ?? "day",
  });
  return backendFetch<{
    tenant_id: string;
    group_by: string;
    buckets: Array<{
      key: string;
      attempts: number;
      reported_input_tokens: number | null;
      reported_output_tokens: number | null;
      unknown_usage_count: number;
      estimated_cost_usd: string | null;
      unknown_cost_count: number;
    }>;
  }>(
    tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/inference-usage?${params}`,
    { method: "GET" }
  );
}

export async function getDetectionRunInference(
  tenantId: string,
  runId: string
) {
  return backendFetch<{
    tenant_id: string;
    detection_run_id: string;
    attempts: number;
    reported_input_tokens: number | null;
    reported_output_tokens: number | null;
    unknown_usage_count: number;
    estimated_cost_usd: string | null;
    unknown_cost_count: number;
  }>(
    tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/detection-runs/${encodeURIComponent(runId)}/inference`,
    { method: "GET" }
  );
}

export async function publishIngestion(tenantId: string, uploadId: string, input: {
  source: string; replace: boolean; conversations: BackendConversationInput[]; detections: BackendDetectionInput[];
  files?: { source: string; conversation_ids: string[]; counts_as_weekly?: boolean }[];
  append_only?: boolean;
  record_upload_metadata?: boolean;
}) {
  return backendFetch<{
    upload_id: string; status: string; active: boolean;
    weekly_export_count?: number | null;
    last_uploaded_file_name?: string | null;
    predictions: { id: string; conversation_id: string; signal_type: string; active: boolean }[];
  }>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/ingestions/${encodeURIComponent(uploadId)}`, {
      method: "PUT", body: JSON.stringify(input), timeoutMs: BACKEND_MUTATION_TIMEOUT_MS,
    });
}

export interface BackendIngestionStatus {
  upload_id: string; status: "staged" | "completed" | "failed";
  source: string; content_sha256: string; active: boolean; imported_at: string;
}
export async function getIngestionStatus(tenantId: string, uploadId: string) {
  return backendFetch<BackendIngestionStatus>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/ingestions/${encodeURIComponent(uploadId)}`, { method: "GET" });
}

export async function getNeedsReviewPage(tenantId: string, opts: {
  limit: number; after?: string; conversationIds?: string[];
}): Promise<{ predictions: BackendPrediction[]; next_cursor: string | null }> {
  const params = new URLSearchParams({ limit: String(opts.limit) });
  if (opts.after) params.set("after", opts.after);
  appendKeepSetConversationIds(params, opts.conversationIds);
  const page = await backendFetch<{ predictions: BackendPrediction[]; next_cursor: string | null }>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/signals/needs-review/page?${params}`);
  if (!page || !Array.isArray(page.predictions) || page.predictions.length > opts.limit ||
      (page.next_cursor !== null && (typeof page.next_cursor !== "string" || !page.next_cursor))) {
    throw new Error("Review queue returned an invalid page.");
  }
  return page;
}

export async function getTenantSignalsPage(tenantId: string, opts: {
  limit: number; after?: string; conversationIds?: string[];
}): Promise<{ predictions: BackendPredictionWithFeedback[]; next_cursor: string | null }> {
  const params = new URLSearchParams({ limit: String(opts.limit) });
  if (opts.after) params.set("after", opts.after);
  appendKeepSetConversationIds(params, opts.conversationIds);
  const page = await backendFetch<{ predictions: BackendPredictionWithFeedback[]; next_cursor: string | null }>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/signals/page?${params}`);
  if (!page || !Array.isArray(page.predictions) || page.predictions.length > opts.limit ||
      (page.next_cursor !== null && (typeof page.next_cursor !== "string" || !page.next_cursor))) {
    throw new Error("Tenant signals returned an invalid page.");
  }
  return page;
}


export async function getPublishedConversationIds(tenantId: string, conversationIds: string[]): Promise<string[]> {
  if (conversationIds.length === 0) return [];
  if (conversationIds.length > 50 || conversationIds.some((id) => typeof id !== "string" || !id || id.length > 256)) {
    throw new Error("Invalid published conversation scope");
  }
  const result = await backendFetch<{ conversation_ids: string[] }>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/uploads/published-conversations`, {
      method: "POST", body: JSON.stringify({ conversation_ids: conversationIds }),
    });
  if (!result || !Array.isArray(result.conversation_ids) || result.conversation_ids.length > conversationIds.length ||
      new Set(result.conversation_ids).size !== result.conversation_ids.length ||
      result.conversation_ids.some((id) => typeof id !== "string" || !conversationIds.includes(id))) {
    throw new Error("Invalid published conversation lookup");
  }
  return result.conversation_ids;
}

/** CB-07 admission always uses a verified actor, including off/shadow callers. */
async function budgetHeaders(tenantId: string): Promise<Record<string, string>> {
  const actor = await resolveActor(tenantId);
  const key = process.env.SIOONA_ACTOR_KEY?.trim();
  if (!actor || !key) throw new Error("budget_actor_unavailable");
  if (actor.tid !== tenantId) throw new Error("budget_actor_scope");
  return { "X-Sioona-Actor": signActorAssertion(actor.sub, actor.tid, key) };
}
export async function reserveInferenceAttempt(tenantId: string, body: {
  attempt_id: string; run_id: string; provider: string; model: string; input_bytes: number;
  logical_operation_id: string; attempt_ordinal: number; conversation_id?: string; route_version: string; prompt_version: string;
}): Promise<{ authorized: boolean; attempt_id: string; mode: string }> {
  // No retry: a lost admission response must never authorize a second dispatch.
  return backendFetchOnce(tenantId, `/v1/tenants/${encodeURIComponent(tenantId)}/inference-reservations`,
    { method: "POST", headers: await budgetHeaders(tenantId), body: JSON.stringify(body) }, 5_000);
}
export async function settleInferenceReservation(tenantId: string, attemptId: string): Promise<{ok: boolean}> {
  return backendFetchOnce(tenantId, `/v1/tenants/${encodeURIComponent(tenantId)}/inference-reservations/${encodeURIComponent(attemptId)}/settle`,
    { method: "POST", headers: await budgetHeaders(tenantId) }, 5_000);
}

export interface BackendJobStatus {
  job_id: string; upload_id: string;
  status: "queued" | "leased" | "succeeded" | "failed" | "cancelled" | "dead_lettered";
  attempt_count: number; max_attempts: number;
  completed_conversations: number; conversation_count: number;
  last_error_category: string | null;
}
export async function enqueueUploadJob(tenantId: string, uploadId: string, input: {
  source: string; replace: boolean; conversations: BackendConversationInput[];
  files: { source: string; conversation_ids: string[]; counts_as_weekly?: boolean }[];
  append_only?: boolean; record_upload_metadata?: boolean;
}): Promise<BackendJobStatus> {
  return backendFetch<BackendJobStatus>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/jobs/uploads/${encodeURIComponent(uploadId)}`,
    { method: "PUT", headers: await budgetHeaders(tenantId), body: JSON.stringify(input), timeoutMs: BACKEND_MUTATION_TIMEOUT_MS });
}
export async function enqueueDetectJob(tenantId: string, requestId: string, conversationIds: string[]): Promise<BackendJobStatus> {
  return backendFetch<BackendJobStatus>(tenantId, `/v1/tenants/${encodeURIComponent(tenantId)}/jobs/detect`,
    { method: "POST", headers: await budgetHeaders(tenantId), body: JSON.stringify({ request_id: requestId, conversation_ids: conversationIds }), timeoutMs: BACKEND_MUTATION_TIMEOUT_MS });
}
export async function getJobStatus(tenantId: string, jobId: string): Promise<BackendJobStatus> {
  return backendFetch<BackendJobStatus>(tenantId,
    `/v1/tenants/${encodeURIComponent(tenantId)}/jobs/${encodeURIComponent(jobId)}`, { method: "GET", headers: await budgetHeaders(tenantId) });
}
