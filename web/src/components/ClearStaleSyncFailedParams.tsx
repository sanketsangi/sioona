"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Drop stale ?syncFailed= / ?syncCreated= once dual-write is complete in the store.
 */
export function ClearStaleSyncFailedParams({
  shouldClear,
}: {
  shouldClear: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!shouldClear || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("syncFailed") && !params.has("syncCreated")) return;
    params.delete("syncFailed");
    params.delete("syncCreated");
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/");
  }, [shouldClear, router]);

  return null;
}
