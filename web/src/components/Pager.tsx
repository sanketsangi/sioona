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
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <p className="tabular text-label-13 text-ds-gray-900">
        {label} {safePage} of {pageCount}
      </p>
      <div className="flex gap-2">
        {prevHref == null ? (
          <button
            type="button"
            disabled
            className="btn-secondary min-w-9 px-3"
          >
            Previous
          </button>
        ) : (
          <Link
            href={prevHref}
            className="btn-secondary min-w-9 px-3"
            scroll={false}
          >
            Previous
          </Link>
        )}
        {nextHref == null ? (
          <button
            type="button"
            disabled
            className="btn-secondary min-w-9 px-3"
          >
            Next
          </button>
        ) : (
          <Link
            href={nextHref}
            className="btn-secondary min-w-9 px-3"
            scroll={false}
          >
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
