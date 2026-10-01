"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { PagerIconLink } from "@/components/PagerIconLink";

/** Insights Prev / Next: outline Button, 44px on touch, 32px from md. */
const pagerButtonClass =
  "h-8 min-h-8 touch-manipulation";

export function Pager({
  page,
  pageCount,
  prevHref,
  nextHref,
  label = "Page",
}: {
  page: number;
  pageCount: number;
  prevHref: string | null;
  nextHref: string | null;
  label?: string;
}) {
  if (pageCount <= 1) return null;

  const safePage = Math.min(Math.max(1, page), pageCount);

  return (
    <nav
      className="flex min-w-0 flex-wrap items-center justify-between gap-2"
      aria-label={`${label} navigation`}
    >
      <p className="tabular min-w-0 text-label-13 text-sio-fg-subtle">
        {label} {safePage} of {pageCount}
      </p>
      <div className="flex shrink-0 gap-2">
        <PagerIconLink
          href={prevHref}
          label="Previous"
          labeled
          className={pagerButtonClass}
        >
          <CaretLeft weight="regular" aria-hidden />
          Previous
        </PagerIconLink>
        <PagerIconLink
          href={nextHref}
          label="Next"
          labeled
          className={pagerButtonClass}
        >
          Next
          <CaretRight weight="regular" aria-hidden />
        </PagerIconLink>
      </div>
    </nav>
  );
}
