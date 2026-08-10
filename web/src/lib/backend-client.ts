/**
 * Server-side client for the FastAPI Signal Score service.
 * Signal Score source of truth is Neon via this API; JSON store is a local mirror.
 */

const DEFAULT_BACKEND_URL = "http://localhost:8000";

/** Fail hung FastAPI calls so dual-write retries can proceed. */
export const BACKEND_FETCH_TIMEOUT_MS = 2500;

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
  return (process.env.BACKEND_URL ?? DEFAULT_BACKEND_URL).replace(/\/$/, "");
}

async function backendFetch<T>(
  tenantId: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${getBackendUrl()}${path}`;
  const { signal: timeoutSignal, clear: clearTimeoutSignal } =
    createTimeoutSignal(BACKEND_FETCH_TIMEOUT_MS);
  const signal = init?.signal
    ? combineAbortSignals(init.signal, timeoutSignal)
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": tenantId,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const detail =
      name === "AbortError"
        ? `timed out after ${BACKEND_FETCH_TIMEOUT_MS}ms`
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
  });
}

export async function submitFeedback(
  tenantId: string,
  signalId: string,
  input: {
    feedback: BackendFeedbackLabel;
    reviewed_by: string;
    note?: string;
  }
): Promise<BackendFeedback> {
  return backendFetch<BackendFeedback>(
    tenantId,
    `/v1/signals/${signalId}/feedback`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export async function getSignalScore(
  tenantId: string,
  opts?: {
    date_from?: string;
    date_to?: string;
    signal_type?: string;
  }
): Promise<BackendSignalScore> {
  const params = new URLSearchParams();
  if (opts?.date_from) params.set("date_from", opts.date_from);
  if (opts?.date_to) params.set("date_to", opts.date_to);
  if (opts?.signal_type) params.set("signal_type", opts.signal_type);
  const qs = params.toString();
  const path = `/v1/tenants/${encodeURIComponent(tenantId)}/signal-score${
    qs ? `?${qs}` : ""
  }`;
  return backendFetch<BackendSignalScore>(tenantId, path);
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
