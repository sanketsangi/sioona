"use client";

import Link from "next/link";

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
      className="flex shrink-0 flex-wrap items-center justify-between gap-2"
      aria-label={`${label} navigation`}
    >
      <p className="tabular text-label-13 text-ds-gray-900">
        {label} {safePage} of {pageCount}
      </p>
      <div className="flex gap-2">
        {prevHref == null ? (
          <span
            className="btn-secondary min-w-11 px-3 opacity-40"
            aria-disabled="true"
          >
            Previous
          </span>
        ) : (
          <Link
            href={prevHref}
            className="btn-secondary min-w-11 px-3"
            scroll={false}
            rel="prev"
          >
            Previous
          </Link>
        )}
        {nextHref == null ? (
          <span
            className="btn-secondary min-w-11 px-3 opacity-40"
            aria-disabled="true"
          >
            Next
          </span>
        ) : (
          <Link
            href={nextHref}
            className="btn-secondary min-w-11 px-3"
            scroll={false}
            rel="next"
          >
            Next
          </Link>
        )}
      </div>
    </nav>
  );
}
