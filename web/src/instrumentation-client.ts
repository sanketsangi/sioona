import * as Sentry from "@sentry/nextjs";
import {
  installCursorRefHydrationFilter,
  startCursorRefStripUntilHydrated,
} from "@/lib/cursor-ref-hydration";
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

// Cursor preview stamps `data-cursor-ref` onto SSR HTML before React hydrates.
// Strip those attrs until AppShell mounts, and keep a console.error trap
// outermost so Next's later `patchConsoleError` assignment cannot revive the overlay.
startCursorRefStripUntilHydrated();
installCursorRefHydrationFilter();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
