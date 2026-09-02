import * as Sentry from "@sentry/nextjs";
import {
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
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: scrubSentryBreadcrumb,
  debug: process.env.SENTRY_DEBUG === "1",
});
