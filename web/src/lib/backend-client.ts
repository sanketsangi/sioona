/**
 * Server-side client for the FastAPI Signal Score service.
 * Signal Score source of truth is Neon via this API; JSON store is a local mirror.
 */

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
  id: string;
  tenant_id: string;
  conversation_id: string;
  signal_type: string;
  confidence: number;
  summary: string;
  created_at: string;
  /** Present after 004; treat missing as false (fail-soft). */
  acted?: boolean;
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

async function backendFetch<T>(
  tenantId: string,
  path: string,
  init?: BackendFetchInit
): Promise<T> {
  const url = `${assertBackendUrlConfigured()}${path}`;
  const { timeoutMs: timeoutOverride, signal: userSignal, ...rest } = init ?? {};
  const timeoutMs = timeoutOverride ?? BACKEND_FETCH_TIMEOUT_MS;
  const { signal: timeoutSignal, clear: clearTimeoutSignal } =
    createTimeoutSignal(timeoutMs);
  const signal = userSignal
    ? combineAbortSignals(userSignal, timeoutSignal)
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": tenantId,
        ...(rest.headers ?? {}),
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
    } = { conversation_ids: opts.conversationIds };
    if (opts.date_from) body.date_from = opts.date_from;
    if (opts.date_to) body.date_to = opts.date_to;
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
  const qs = params.toString();
  return backendFetch<BackendSignalScore>(
    tenantId,
    qs ? `${path}?${qs}` : path
  );
}

export async function getNeedsReview(
  tenantId: string,
  limit = 20
): Promise<BackendPrediction[]> {
  const path = `/v1/tenants/${encodeURIComponent(
    tenantId
  )}/signals/needs-review?limit=${limit}`;
  return backendFetch<BackendPrediction[]>(tenantId, path);
}

export async function getConversations(
  tenantId: string,
  opts?: {
    /** Insights overlay keep-set. Empty array → no rows (not the full tenant). */
    conversationIds?: string[];
  }
): Promise<BackendConversation[]> {
  const params = new URLSearchParams();
  if (opts?.conversationIds !== undefined) {
    if (opts.conversationIds.length === 0) {
      params.append("conversation_id", "");
    } else {
      for (const id of opts.conversationIds) {
        if (id) params.append("conversation_id", id);
      }
      if (!params.has("conversation_id")) {
        params.append("conversation_id", "");
      }
    }
  }
  const qs = params.toString();
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/conversations${
    qs ? `?${qs}` : ""
  }`;
  return backendFetch<BackendConversation[]>(tenantId, path);
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

export async function getTenantSignals(
  tenantId: string
): Promise<BackendPredictionWithFeedback[]> {
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/signals`;
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
    if (err instanceof BackendClientError && err.status === 404) {
      return null;
    }
    throw err;
  }
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
  });
}
