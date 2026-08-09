import { SIGNAL_TAXONOMY } from "@/lib/taxonomy";
import { SignalBadge } from "@/components/SignalBadge";
import { Pager } from "@/components/Pager";
import { parsePage, viewHref } from "@/lib/views";

export function TaxonomyView({ typePageRaw }: { typePageRaw?: string | null }) {
  const pageCount = SIGNAL_TAXONOMY.length;
  const page = Math.min(parsePage(typePageRaw), pageCount);
  const entry = SIGNAL_TAXONOMY[page - 1] ?? SIGNAL_TAXONOMY[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
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

      <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <SignalBadge type={entry.type} />
          <h2 className="text-balance text-heading-20 text-ds-gray-1000">
            {entry.label}
          </h2>
        </div>
        <p className="mt-2 shrink-0 text-copy-14 text-ds-gray-900">
          {entry.description}
        </p>

        <div className="mt-5 grid min-h-0 flex-1 gap-6 md:grid-cols-2">
          <div className="flex min-h-0 flex-col">
            <h3 className="eyebrow shrink-0">Example Utterances</h3>
            <ul className="mt-2 divide-y divide-ds-gray-400 border-t border-ds-gray-400">
              {entry.examples.slice(0, 4).map((example) => (
                <li
                  key={example}
                  className="break-words py-2.5 text-copy-14 text-ds-gray-1000"
                >
                  “{example}”
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-h-0 flex-col">
            <h3 className="eyebrow shrink-0">Suggested Actions</h3>
            <ul className="mt-2 space-y-2 border-t border-ds-gray-400 pt-2.5 text-copy-14 text-ds-gray-900">
              {entry.suggestedActions.slice(0, 5).map((action) => (
                <li key={action} className="flex gap-2">
                  <span className="text-ds-gray-700" aria-hidden>
                    ·
                  </span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
