/**
 * Shared Sentry init pieces for browser, Node, and Edge.
 *
 * Sample rates (change here — all three runtimes read these):
 * - tracesSampleRate: 1.0 in development, 0.2 in production.
 *   Low-traffic Shadow Mode demo; 20% of prod requests/navigations become traces.
 * - profileSessionSampleRate: 1.0 in development, 0.2 in production.
 *   Session-level (page load / Node process). Profiles attach only when the
 *   session is sampled *and* the span is traced (`profileLifecycle: "trace"`).
 *   Combined ≈ 4% of production requests carry a flamegraph.
 *
 * PII: conversation text stays out of Sentry. `dataCollection` is set
 * explicitly (passing `{}` would flip omitted categories to permissive
 * defaults). `beforeSend` / `beforeBreadcrumb` drop leftover bodies.
 */

import type { Breadcrumb, DataCollection, ErrorEvent } from "@sentry/core";

export const SENTRY_TRACES_SAMPLE_RATE =
  process.env.NODE_ENV === "development" ? 1 : 0.2;

export const SENTRY_PROFILE_SESSION_SAMPLE_RATE =
  process.env.NODE_ENV === "development" ? 1 : 0.2;

/** Conservative collection — no request bodies, cookies, or stack locals. */
export const sentryDataCollection: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
};

const CONVERSATION_KEY =
  /^(messages?|conversations?|chats?|transcript|evidence|body|content|text|why|payload|formdata|requestbody)$/i;

export function sentryDsn(): string | undefined {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  return dsn || undefined;
}

export function sentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

function dropConversationFields(
  record: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!record) return record;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (CONVERSATION_KEY.test(key)) continue;
    next[key] = value;
  }
  return next;
}

/** Strip request bodies and conversation-shaped extras before send. */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }

  if (event.extra) {
    event.extra = dropConversationFields(
      event.extra as Record<string, unknown>,
    ) as ErrorEvent["extra"];
  }

  if (event.contexts) {
    const contexts = event.contexts as Record<string, unknown>;
    for (const key of Object.keys(contexts)) {
      if (CONVERSATION_KEY.test(key)) {
        delete contexts[key];
      }
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubSentryBreadcrumb);
  }

  return event;
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  delete data.body;
  delete data.request_body;
  delete data.response_body;
  return {
    ...breadcrumb,
    data: dropConversationFields(data as Record<string, unknown>),
  };
}

/** Native ABIs bundled by the installed profiling-node package. */
export function sentryNodeProfilingEnabled(nodeVersion: string, dsn: string | undefined): boolean {
  return Boolean(dsn?.trim()) && [20, 22, 24, 26].includes(Number(nodeVersion.split(".")[0]));
}
