"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html
      lang="en"
      className={`theme h-full font-sans ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="flex min-h-full items-center justify-center bg-muted p-6 font-sans text-foreground antialiased">
        <main className="max-w-md text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            Something Went Wrong
          </h1>
          <p className="mt-2 text-balance text-sm text-muted-foreground">
            This page hit an unexpected error. Return home and try again.
          </p>
          <a
            href="/"
            className="btn-primary mt-6 inline-flex min-h-9 items-center justify-center px-3"
          >
            Go to Insights
          </a>
        </main>
      </body>
    </html>
  );
}
