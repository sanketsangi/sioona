import * as Sentry from "@sentry/nextjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
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
  integrations: [nodeProfilingIntegration()],
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: scrubSentryBreadcrumb,
  debug: process.env.SENTRY_DEBUG === "1",
});
