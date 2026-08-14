import { useId } from "react";
import { formatEvidenceItem } from "@/lib/format";
import { isNeonStubSignalId } from "@/lib/prediction-sync";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalReviewSuggestedActionProps = {
  signal: Signal;
  className?: string;
};

function EvidenceChip({ text }: { text: string }) {
  const sep = text.indexOf(" · ");
  const kindLabel = sep > 0 ? text.slice(0, sep) : null;
  const value = sep > 0 ? text.slice(sep + 3) : text;

  return (
    <span className="inline-block max-w-full rounded-sm bg-sio-bg-muted px-2 py-0.5 text-label-12">
      {kindLabel ? (
        <span className="text-sio-fg-muted">{kindLabel}</span>
      ) : null}
      {kindLabel ? <span className="text-sio-fg-muted"> · </span> : null}
      <span className="break-words text-pretty text-sio-fg-base">{value}</span>
    </span>
  );
}

/**
 * Suggested Next Action + Why This Fired — display-only metric-strip.
 * Neon stubs / missing join show honest empty copy.
 */
export function SignalReviewSuggestedAction({
  signal,
  className,
}: SignalReviewSuggestedActionProps) {
  const headingId = useId();
  const whyId = useId();
  const isNeonStub = isNeonStubSignalId(signal.id);
  const missingLocalJoin = isNeonStub || !signal.suggestedAction;

  const formatted = signal.evidence.map((item) => ({
    item,
    ...formatEvidenceItem(item),
  }));
  const quotes = formatted.filter((entry) => entry.kind === "quote");
  const matches = formatted.filter(
    (entry) => entry.kind === "match" || entry.kind === "suppressed",
  );
  const hasEvidence = quotes.length > 0 || matches.length > 0;

  return (
    <section
      className={cn("metric-strip flex flex-col", className)}
      aria-labelledby={headingId}
    >
      <div className="border-b border-sio-border-base px-3 py-2">
        <h3
          id={headingId}
          className="truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base"
        >
          Suggested Next Action
        </h3>
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-3 py-3">
        <p
          className={cn(
            "break-words text-pretty text-copy-14 font-medium",
            missingLocalJoin ? "text-sio-fg-muted" : "text-sio-fg-base",
          )}
        >
          {missingLocalJoin
            ? "Unavailable — local detection join missing."
            : signal.suggestedAction}
        </p>

        <section
          className="mt-3 border-t border-sio-border-base pt-3"
          aria-labelledby={whyId}
        >
          <h4 id={whyId} className="text-label-12 font-medium text-sio-fg-muted">
            Why This Fired
          </h4>

          {hasEvidence ? (
            <div className="mt-1.5 flex flex-col gap-2">
              {quotes.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {quotes.map(({ item, text }) => (
                    <li key={item} className="min-w-0">
                      <blockquote className="border-l border-sio-border-base pl-2.5">
                        <p className="break-words text-pretty text-copy-14 text-sio-fg-subtle">
                          “{text}”
                        </p>
                      </blockquote>
                    </li>
                  ))}
                </ul>
              ) : null}

              {matches.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {matches.map(({ item, text }) => (
                    <li key={item} className="min-w-0 max-w-full">
                      <EvidenceChip text={text} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="mt-1.5 break-words text-pretty text-copy-14 text-sio-fg-muted">
              {isNeonStub
                ? "No local evidence — detection join missing."
                : "No local evidence."}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
