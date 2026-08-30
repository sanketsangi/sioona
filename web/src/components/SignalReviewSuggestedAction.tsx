import { useId } from "react";
import { SignalStatus } from "@/components/SignalStatus";
import { formatEvidenceItem } from "@/lib/format";
import { isNeonStubSignalId } from "@/lib/prediction-sync";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalReviewSuggestedActionProps = {
  signal: Signal;
  className?: string;
};

/** ≤2 quote lines in Why This Fired (UI_DESIGN). */
const MAX_WHY_QUOTES = 2;

function EvidenceChip({ text }: { text: string }) {
  const sep = text.indexOf(" · ");
  const kindLabel = sep > 0 ? text.slice(0, sep) : null;
  const value = sep > 0 ? text.slice(sep + 3) : text;

  return (
    <span className="inline-flex max-w-full items-baseline gap-1.5 rounded-md border border-sio-border-subtle bg-sio-bg-base px-2 py-1 text-label-12 shadow-[0_0_0_1px_rgba(0,0,0,0.02)]">
      {kindLabel ? (
        <span className="shrink-0 font-medium text-sio-fg-muted">
          {kindLabel}
        </span>
      ) : null}
      <span
        className="min-w-0 break-words font-medium text-sio-fg-base"
        translate="no"
      >
        {value}
      </span>
    </span>
  );
}

/**
 * Suggested Next Action + Why This Fired — display-only two-cell metric-strip.
 * Neon stubs / missing join show honest empty copy. Acted uses SignalStatus.
 */
export function SignalReviewSuggestedAction({
  signal,
  className,
}: SignalReviewSuggestedActionProps) {
  const headingId = useId();
  const whyId = useId();
  const isActed = signal.status === "acted";
  const missingAction = !signal.suggestedAction;
  const isNeonStub = isNeonStubSignalId(signal.id);

  const formatted = signal.evidence.map((item) => ({
    item,
    ...formatEvidenceItem(item),
  }));
  const quotes = formatted
    .filter((entry) => entry.kind === "quote")
    .slice(0, MAX_WHY_QUOTES);
  const matches = formatted.filter(
    (entry) => entry.kind === "match" || entry.kind === "suppressed",
  );
  const hasEvidence = quotes.length > 0 || matches.length > 0;

  return (
    <section
      className={cn("metric-strip flex min-h-0 flex-col", className)}
      aria-labelledby={headingId}
    >
      <div className="grid min-w-0 flex-1 grid-cols-1 divide-y divide-sio-border-base xl:grid-cols-2 xl:divide-x xl:divide-y-0">
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sio-border-base px-3 py-2">
            <h3
              id={headingId}
              className="truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base"
            >
              Suggested Next Action
            </h3>
            {isActed ? <SignalStatus signal={signal} /> : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-3">
            {isActed ? (
              <p className="text-pretty text-label-13 text-sio-fg-muted">
                Marked as Acted — not sent.
              </p>
            ) : null}
            <p
              className={cn(
                "break-words text-pretty text-copy-14 font-medium leading-5",
                missingAction ? "text-sio-fg-muted" : "text-sio-fg-base",
              )}
            >
              {missingAction
                ? "Unavailable — local detection join missing."
                : signal.suggestedAction}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col" aria-labelledby={whyId}>
          <div className="border-b border-sio-border-base px-3 py-2">
            <h4
              id={whyId}
              className="truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base"
            >
              Why This Fired
            </h4>
          </div>

          <div className="flex min-w-0 flex-1 flex-col px-3 py-3">
            {hasEvidence ? (
              <div className="flex flex-col gap-2.5">
                {quotes.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {quotes.map(({ item, text }) => (
                      <li key={item} className="min-w-0">
                        <blockquote className="border-l-2 border-sio-fg-base/20 pl-3">
                          <p className="line-clamp-2 break-words text-pretty text-copy-14 leading-5 text-sio-fg-base">
                            “{text}”
                          </p>
                        </blockquote>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {matches.length > 0 ? (
                  <div className="min-w-0">
                    <p className="text-label-12 font-medium text-sio-fg-muted">
                      Matched
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {matches.map(({ item, text }) => (
                        <li key={item} className="min-w-0 max-w-full">
                          <EvidenceChip text={text} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="break-words text-pretty text-copy-14 text-sio-fg-muted">
                {isNeonStub
                  ? "No local evidence — detection join missing."
                  : "No local evidence."}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
