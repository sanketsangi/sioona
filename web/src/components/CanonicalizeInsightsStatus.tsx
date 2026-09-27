"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  statusQueryValue,
  type StatusFilter,
  type WorkspaceMode,
} from "@/lib/views";

/**
 * Build the address-bar URL when Insights SSR omitted `?status=` but
 * `resolveInsightsStatusFilter` chose a concrete filter. Returns null when
 * no canonicalize is needed (explicit Filters, or Shadow `all`).
 */
export function insightsStatusCanonicalUrl(
  search: string,
  statusFilter: StatusFilter,
  workspaceMode: WorkspaceMode,
  statusOmitted: boolean,
): string | null {
  if (!statusOmitted) return null;
  const expected = statusQueryValue(statusFilter, workspaceMode);
  if (expected == null) return null;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const current = params.get("status");
  if (current != null && current !== "") return null;
  params.set("status", expected);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

/**
 * Drop a `?preview=` that is not in the current queue. Keeps filters.
 * Returns null when there is nothing to strip.
 */
export function unresolvedPreviewCanonicalUrl(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  if (!params.has("preview")) return null;
  params.delete("preview");
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

/**
 * Sync the address bar via `history.replaceState` — no `router.replace`, no
 * second RSC fetch.
 */
export function CanonicalizeInsightsStatus({
  statusFilter,
  workspaceMode,
  statusOmitted,
  unresolvedPreview = false,
}: {
  statusFilter: StatusFilter;
  workspaceMode: WorkspaceMode;
  /** True when the request URL had no non-empty `status` param. */
  statusOmitted: boolean;
  /** `?preview=` is not in pending or reviewed — drop it so the list stays. */
  unresolvedPreview?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = insightsStatusCanonicalUrl(
      window.location.search,
      statusFilter,
      workspaceMode,
      statusOmitted,
    );
    if (next == null) return;
    window.history.replaceState(window.history.state, "", next);
  }, [statusFilter, workspaceMode, statusOmitted]);

  useEffect(() => {
    if (!unresolvedPreview || typeof window === "undefined") return;
    const next = unresolvedPreviewCanonicalUrl(window.location.search);
    if (next == null) return;
    // Router replace so Next does not restore the stale preview from the RSC URL.
    router.replace(next);
  }, [unresolvedPreview, router]);

  return null;
}
