"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
      className="flex flex-wrap items-center justify-between gap-2"
      aria-label={`${label} navigation`}
    >
      <p className="tabular text-label-13 text-ds-gray-900">
        {label} {safePage} of {pageCount}
      </p>
      <div className="flex gap-2">
        <PagerButton href={prevHref} direction="prev" />
        <PagerButton href={nextHref} direction="next" />
      </div>
    </nav>
  );
}

function PagerButton({
  href,
  direction,
}: {
  href: string | null;
  direction: "prev" | "next";
}) {
  const isPrev = direction === "prev";
  const text = isPrev ? "Previous" : "Next";
  const icon = isPrev ? (
    <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden />
  ) : (
    <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
  );

  if (href == null) {
    return (
      <button type="button" className="btn-secondary px-3" disabled>
        {isPrev ? icon : null}
        {text}
        {isPrev ? null : icon}
      </button>
    );
  }

  return (
    <Link href={href} className="btn-secondary px-3" scroll={false}>
      {isPrev ? icon : null}
      {text}
      {isPrev ? null : icon}
    </Link>
  );
}
