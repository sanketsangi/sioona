"use client";

import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";

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
    <CaretLeft className="size-4" weight="regular" aria-hidden />
  ) : (
    <CaretRight className="size-4" weight="regular" aria-hidden />
  );

  const className = "btn-secondary min-w-11 px-3";

  if (href == null) {
    return (
      <button type="button" className={className} disabled aria-label={text}>
        {isPrev ? icon : null}
        <span className="hidden min-[380px]:inline">{text}</span>
        {isPrev ? null : icon}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className={className}
      scroll={false}
      aria-label={text}
    >
      {isPrev ? icon : null}
      <span className="hidden min-[380px]:inline">{text}</span>
      {isPrev ? null : icon}
    </Link>
  );
}
