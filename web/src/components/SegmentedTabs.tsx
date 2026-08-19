import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type SegmentedTabItem = {
  id: string;
  href: string;
  label: string;
};

/**
 * Slider segmented control — Eval panels and Labeled tables.
 * Active highlight is a single thumb translated by `--seg-index` (no JS measure).
 */
export function SegmentedTabs({
  items,
  activeId,
  label,
  className,
}: {
  items: SegmentedTabItem[];
  activeId: string;
  label: string;
  className?: string;
}) {
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeId)
  );

  const style = {
    "--seg-count": items.length,
    "--seg-index": activeIndex,
  } as CSSProperties;

  return (
    <div
      className={cn("segmented-tabs", className)}
      role="group"
      aria-label={label}
      style={style}
    >
      <span className="segmented-tabs-thumb" aria-hidden />
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Link
            key={item.id}
            href={item.href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "segmented-tabs-link segmented-tabs-link-active"
                : "segmented-tabs-link"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
