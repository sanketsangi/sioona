"use client";

import { useEffect } from "react";
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
 * Sync the address bar via `history.replaceState` — no `router.replace`, no
 * second RSC fetch.
 */
export function CanonicalizeInsightsStatus({
  statusFilter,
  workspaceMode,
  statusOmitted,
}: {
  statusFilter: StatusFilter;
  workspaceMode: WorkspaceMode;
  /** True when the request URL had no non-empty `status` param. */
  statusOmitted: boolean;
}) {
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

  return null;
}
