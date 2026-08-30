import { SIGNAL_TAXONOMY } from "@/lib/taxonomy";
import { SignalBadge } from "@/components/SignalBadge";
import { Pager } from "@/components/Pager";
import { ViewFrame } from "@/components/ViewFrame";
import { parsePage, viewHref } from "@/lib/views";

export function TaxonomyView({ typePageRaw }: { typePageRaw?: string | null }) {
  const pageCount = SIGNAL_TAXONOMY.length;
  const page = Math.min(parsePage(typePageRaw), pageCount);
  const entry = SIGNAL_TAXONOMY[page - 1] ?? SIGNAL_TAXONOMY[0];

  return (
    <ViewFrame>
      <div className="shrink-0">
        <Pager
          page={page}
          pageCount={pageCount}
          label="Type"
          prevHref={
            page > 1
              ? viewHref("taxonomy", {
                  taxPage: page - 1 > 1 ? String(page - 1) : null,
                })
              : null
          }
          nextHref={
            page < pageCount
              ? viewHref("taxonomy", { taxPage: String(page + 1) })
              : null
          }
        />
      </div>

      <section className="panel scroll-region min-h-0 min-w-0 flex-1 p-4 sm:p-5 lg:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <SignalBadge type={entry.type} />
          <h2 className="text-balance text-heading-20 text-sio-fg-base">
            {entry.label}
          </h2>
        </div>
        <p className="mt-2 max-w-2xl text-pretty text-copy-14 text-sio-fg-subtle">
          {entry.description}
        </p>

        <div className="mt-5 grid gap-6 md:grid-cols-2 md:gap-8">
          <div className="min-w-0">
            <h3 className="eyebrow">Example Utterances</h3>
            <ul className="mt-2 divide-y divide-sio-border-base border-y border-sio-border-base">
              {entry.examples.map((example) => (
                <li
                  key={example}
                  className="text-pretty break-words py-2.5 text-copy-14 text-sio-fg-base"
                >
                  “{example}”
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <h3 className="eyebrow">Suggested Actions</h3>
            <ul className="mt-2 space-y-2 border-t border-sio-border-base pt-3 text-copy-14 text-sio-fg-subtle">
              {entry.suggestedActions.map((action) => (
                <li key={action} className="flex gap-2">
                  <span className="text-sio-fg-muted" aria-hidden>
                    ·
                  </span>
                  <span className="text-pretty break-words">{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </ViewFrame>
  );
}
