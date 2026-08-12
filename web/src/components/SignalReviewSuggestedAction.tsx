import { ArrowRight } from "@phosphor-icons/react/ssr";
import { formatEvidenceItem } from "@/lib/format";
import { isNeonStubSignalId } from "@/lib/prediction-sync";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_WHY_ITEMS = 2;

type SignalReviewSuggestedActionProps = {
  signal: Signal;
  className?: string;
};

/**
 * Suggested Next Action + Why This Fired — display-only metric-strip.
 * Neon stubs / missing join show honest empty copy.
 */
export function SignalReviewSuggestedAction({
  signal,
  className,
}: SignalReviewSuggestedActionProps) {
  const isNeonStub = isNeonStubSignalId(signal.id);
  const evidenceItems = signal.evidence.slice(0, MAX_WHY_ITEMS);
  const missingLocalJoin = isNeonStub || !signal.suggestedAction;

  return (
    <div className={cn("metric-strip flex flex-col", className)}>
      <section className="min-w-0 px-3 py-3">
        <div className="flex items-center gap-1.5">
          <ArrowRight
            className="size-3.5 shrink-0 text-sio-fg-muted"
            weight="bold"
            aria-hidden
          />
          <h3 className="text-label-12 font-semibold tracking-wide text-sio-fg-base">
            Suggested Next Action
          </h3>
        </div>
        <p className="mt-1.5 break-words text-pretty text-copy-14 font-medium text-sio-fg-base">
          {missingLocalJoin
            ? "Unavailable — local detection join missing."
            : signal.suggestedAction}
        </p>
        <p className="mt-1 text-label-12 text-sio-fg-muted">
          Display-only — not sent by Sioona.
        </p>
      </section>

      <div className="mx-3 border-t border-sio-border-base" aria-hidden />

      <section className="min-w-0 px-3 py-3">
        <h3 className="text-label-12 font-semibold tracking-wide text-sio-fg-base">
          Why This Fired
        </h3>
        {evidenceItems.length > 0 ? (
          <ul className="mt-1.5 space-y-1.5">
            {evidenceItems.map((item) => {
              const { kind, text } = formatEvidenceItem(item);
              return (
                <li key={item} className="min-w-0 text-copy-14">
                  {kind === "quote" ? (
                    <p className="break-words text-pretty text-sio-fg-subtle">
                      “{text}”
                    </p>
                  ) : (
                    <p className="break-words text-label-12 text-sio-fg-muted">
                      {text}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1.5 text-copy-14 text-sio-fg-muted">
            {isNeonStub
              ? "No local evidence — detection join missing."
              : "No local evidence."}
          </p>
        )}
      </section>
    </div>
  );
}
