"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { vaultKeepSetRefreshDelay } from "@/lib/vault-file";

function refreshKey(fileName: string): string {
  return `sioona-vault-refresh:${fileName}`;
}

/**
 * The redirect after upload can render before Neon has the chats.
 * Refresh a few times, then leave the upload empty state in place.
 */
export function VaultKeepSetRefresh({
  active,
  fileName,
}: {
  active: boolean;
  fileName: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active || !fileName) return;
    const key = refreshKey(fileName);
    let attempt = 0;
    try {
      attempt = Number(sessionStorage.getItem(key) ?? "0");
      if (!Number.isFinite(attempt)) attempt = 0;
    } catch {
      attempt = 0;
    }
    const delay = vaultKeepSetRefreshDelay(attempt);
    if (delay == null) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(key, String(attempt + 1));
      } catch {
        // Private mode — one refresh is still worth trying.
      }
      router.refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active, fileName, router]);

  useEffect(() => {
    if (active || !fileName) return;
    try {
      sessionStorage.removeItem(refreshKey(fileName));
    } catch {
      // Ignore storage failures.
    }
  }, [active, fileName]);

  return null;
}
