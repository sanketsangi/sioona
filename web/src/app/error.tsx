"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function InsightsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight text-sio-fg-base">
        Insights Could Not Be Loaded
      </h1>
      <p className="mt-2 text-balance text-copy-14 text-sio-fg-subtle">
        Postgres could not be read. Retry the request.
      </p>
      <button
        type="button"
        className="btn-primary mt-6 inline-flex min-h-9 items-center justify-center px-3"
        onClick={() => retry()}
      >
        Retry the request
      </button>
    </main>
  );
}
