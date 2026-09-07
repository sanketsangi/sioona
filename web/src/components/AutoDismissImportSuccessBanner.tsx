"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/** Visible hold before fade / URL strip. */
export const IMPORT_SUCCESS_BANNER_HOLD_MS = 4000;

/** Opacity fade duration (skipped when prefers-reduced-motion). */
export const IMPORT_SUCCESS_BANNER_FADE_MS = 280;

/**
 * Drop ?imported= / ?signals= after a successful import toast — same pattern as
 * ClearStaleSyncFailedParams so refresh does not revive the banner.
 */
export function stripImportSuccessParams(
  search: string,
  replace: (href: string) => void,
): boolean {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  if (!params.has("imported") && !params.has("signals")) return false;
  params.delete("imported");
  params.delete("signals");
  const qs = params.toString();
  replace(qs ? `/?${qs}` : "/");
  return true;
}

/**
 * Auto-dismiss Insights import success banner: hold → fade (or instant when
 * reduced motion) → strip imported/signals from the URL. Warning / zero-signal
 * banners stay mounted without this wrapper.
 */
export function AutoDismissImportSuccessBanner({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const [dismissing, setDismissing] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const finish = () => {
      stripImportSuccessParams(window.location.search, (href) =>
        router.replace(href),
      );
      setGone(true);
    };

    const holdId = window.setTimeout(() => {
      if (reducedMotion) {
        finish();
        return;
      }
      setDismissing(true);
    }, IMPORT_SUCCESS_BANNER_HOLD_MS);

    return () => window.clearTimeout(holdId);
  }, [reducedMotion, router]);

  useEffect(() => {
    if (!dismissing || reducedMotion) return;
    const fadeId = window.setTimeout(() => {
      if (typeof window !== "undefined") {
        stripImportSuccessParams(window.location.search, (href) =>
          router.replace(href),
        );
      }
      setGone(true);
    }, IMPORT_SUCCESS_BANNER_FADE_MS);
    return () => window.clearTimeout(fadeId);
  }, [dismissing, reducedMotion, router]);

  if (gone) return null;

  return (
    <div
      className={cn(
        "status-banner-auto-dismiss",
        dismissing && "is-dismissing",
      )}
      data-auto-dismiss-import-success=""
    >
      {children}
    </div>
  );
}
