import * as Sentry from "@sentry/nextjs";
import {
  SENTRY_PROFILE_SESSION_SAMPLE_RATE,
  SENTRY_TRACES_SAMPLE_RATE,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryDataCollection,
  sentryDsn,
  sentryEnvironment,
} from "@/lib/sentry-options";

Sentry.init({
  dsn: sentryDsn(),
  environment: sentryEnvironment(),
  sendDefaultPii: false,
  dataCollection: sentryDataCollection,
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  profileSessionSampleRate: SENTRY_PROFILE_SESSION_SAMPLE_RATE,
  profileLifecycle: "trace",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.browserProfilingIntegration(),
  ],
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: scrubSentryBreadcrumb,
  debug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === "1",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
