import Link from "next/link";
import { ViewFrame } from "./ViewFrame";
import { PagerIconLink } from "./PagerIconLink";
import { reportScopeHref, snapshotQuotes } from "@/lib/pilot-workflow";
import type { StoreData } from "@/lib/types";
/** Immutable upload inspection never substitutes current rows or enables old decisions. */
export function ScopedReportQueue({
  store,
  query,
  preview,
  page = 1,
  error,
}: {
  store: StoreData;
  query: string;
  preview?: string;
  page?: number;
  error?: string;
}) {
  const params = new URLSearchParams(query);
  const pages = Math.max(1, Math.ceil(store.signals.length / 10));
  const current = Math.max(1, Math.min(pages, page));
  const selected = store.signals.find((signal) => signal.id === preview);
  const quotes = selected ? snapshotQuotes(selected, store.messages) : [];
  const href = (extras: Record<string, string | null>) =>
    reportScopeHref("insights", params, extras);
  return (
    <ViewFrame className="overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 pb-8">
        <h2 className="text-heading-24">Original upload signals</h2>
        <p>
          Original upload snapshot · read-only. Review and outcome totals use
          the report’s date window. Historical decisions cannot be edited here.
        </p>
        <Link
          href={reportScopeHref("report", params)}
          className="inline-flex min-h-11 items-center underline"
        >
          Back to scoped revenue report
        </Link>
        {error ? (
          <p role="alert">
            {error}{" "}
            <Link href="/?view=report" className="underline">
              Choose a different report
            </Link>
            .
          </p>
        ) : selected ? (
          <section className="panel space-y-3 p-4">
            <h2 className="text-heading-18">{selected.type} signal</h2>
            <p className="break-words">{selected.summary}</p>
            <p>Evidence: {selected.evidenceStatus ?? "unresolved"}</p>
            {quotes.length ? (
              quotes.map((quote, index) => (
                <blockquote key={index} className="break-words border-l-2 pl-3">
                  {quote}
                </blockquote>
              ))
            ) : (
              <p>Source anchor unavailable or stale. No quote inferred.</p>
            )}
            <p>
              Review:{" "}
              {selected.feedback?.label ?? "No review in this date window"}
            </p>
            <p>
              Outcome:{" "}
              {selected.outcome?.outcome ?? "No outcome in this date window"}
            </p>
            <Link
              href={href({ page: String(current) })}
              className="inline-flex min-h-11 items-center underline"
            >
              Back to upload queue
            </Link>
          </section>
        ) : (
          <>
            {preview ? (
              <p role="status">
                That signal is not in this upload. Select a signal from its
                original snapshot.
              </p>
            ) : null}
            <ul className="space-y-2">
              {store.signals
                .slice((current - 1) * 10, current * 10)
                .map((signal) => (
                  <li key={signal.id}>
                    <Link
                      className="panel block min-h-11 space-y-1 p-3 focus-visible:outline-2"
                      href={href({ preview: signal.id, page: String(current) })}
                    >
                      <span className="text-label-14">
                        {signal.type} ·{" "}
                        {signal.historical
                          ? "Historical"
                          : "Persisted upload prediction"}
                      </span>
                      <p className="break-words">{signal.summary}</p>
                      <p className="text-sm">
                        {signal.evidenceStatus ?? "unresolved"} evidence ·{" "}
                        {signal.feedback?.label ?? "Not reviewed in window"}
                      </p>
                    </Link>
                  </li>
                ))}
            </ul>
            {!store.signals.length ? (
              <p>
                No signals in this upload.{" "}
                <Link href="/?view=upload" className="underline">
                  Open uploads
                </Link>
                .
              </p>
            ) : null}
            <nav
              aria-label="Upload evidence pages"
              className="flex items-center gap-3"
            >
              <PagerIconLink
                label="Previous upload evidence page"
                labeled
                href={current > 1 ? href({ page: String(current - 1) }) : null}
              >
                Previous
              </PagerIconLink>
              <p role="status" aria-live="polite" className="tabular-nums">
                Page {current} of {pages} · {store.signals.length} signals
              </p>
              <PagerIconLink
                label="Next upload evidence page"
                labeled
                href={
                  current < pages ? href({ page: String(current + 1) }) : null
                }
              >
                Next
              </PagerIconLink>
            </nav>
          </>
        )}
        <Link
          href="/?view=insights"
          className="inline-flex min-h-11 items-center underline"
        >
          Open current workspace queue
        </Link>
      </div>
    </ViewFrame>
  );
}
