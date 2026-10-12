import * as Sentry from "@sentry/nextjs";
import { assertValidStateModeAtBoot } from "@/lib/state-mode";

export async function register() {
  assertValidStateModeAtBoot();

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
