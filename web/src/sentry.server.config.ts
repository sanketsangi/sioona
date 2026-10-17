import * as Sentry from "@sentry/nextjs";
import {
  SENTRY_PROFILE_SESSION_SAMPLE_RATE,
  SENTRY_TRACES_SAMPLE_RATE,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryDataCollection,
  sentryDsn,
  sentryEnvironment,
  sentryNodeProfilingEnabled,
} from "@/lib/sentry-options";

const dsn = sentryDsn();
const integrations = [];
// Native profiler packages are optional when telemetry is absent or the runtime
// has no supported binary. Error and trace reporting remain configured below.
if (sentryNodeProfilingEnabled(process.versions.node, dsn)) {
  const { nodeProfilingIntegration } = await import("@sentry/profiling-node");
  integrations.push(nodeProfilingIntegration());
}

Sentry.init({
  dsn,
  environment: sentryEnvironment(),
  sendDefaultPii: false,
  dataCollection: sentryDataCollection,
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  profileSessionSampleRate: SENTRY_PROFILE_SESSION_SAMPLE_RATE,
  profileLifecycle: "trace",
  integrations,
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: scrubSentryBreadcrumb,
  debug: process.env.SENTRY_DEBUG === "1",
});
