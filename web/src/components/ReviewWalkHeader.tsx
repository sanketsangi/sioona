"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { PagerIconLink } from "@/components/PagerIconLink";
import {
  isEditableShortcutTarget,
  pendingWalkShortcutForKey,
} from "@/lib/review-triage";

type ReviewWalkHeaderProps = {
  prevHref: string | null;
  nextHref: string | null;
  skipHref: string;
  /** Open Conversation — after Skip; same outline h-8 chrome as pager. */
  openConversation?: ReactNode;
};

/**
 * Insights review chrome: Prev / Next / Skip / Open Conversation + J/K.
 * Shown for any open ?preview= while pending remains (incl. after Correct /
 * Acted). Skip never writes feedback; last Skip drops preview → list.
 */
export function ReviewWalkHeader({
  prevHref,
  nextHref,
  skipHref,
  openConversation = null,
}: ReviewWalkHeaderProps) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableShortcutTarget(e.target)) return;
      const direction = pendingWalkShortcutForKey(e.key);
      if (!direction) return;
      const href = direction === "next" ? nextHref : prevHref;
      if (!href) return;
      e.preventDefault();
      router.push(href, { scroll: false });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextHref, prevHref, router]);

  return (
    <nav
      className="flex min-w-0 flex-wrap items-center justify-end gap-2"
      aria-label="Pending review"
    >
      <PagerIconLink
        href={prevHref}
        label="Previous pending review"
        labeled
        shortcut="K"
      >
        <CaretLeft weight="regular" aria-hidden />
        Prev
      </PagerIconLink>
      <PagerIconLink
        href={nextHref}
        label="Next pending review"
        labeled
        shortcut="J"
      >
        Next
        <CaretRight weight="regular" aria-hidden />
      </PagerIconLink>
      <PagerIconLink href={skipHref} label="Skip pending review" labeled>
        Skip
      </PagerIconLink>
      {openConversation}
    </nav>
  );
}
