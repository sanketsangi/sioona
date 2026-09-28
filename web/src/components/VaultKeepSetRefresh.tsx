"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  readVaultKeepSetRefreshAttempt,
  vaultKeepSetRefreshDelay,
  vaultKeepSetRefreshStorageKey,
} from "@/lib/vault-file";

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
    const key = vaultKeepSetRefreshStorageKey(fileName);
    const attempt = readVaultKeepSetRefreshAttempt(fileName);
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
      sessionStorage.removeItem(vaultKeepSetRefreshStorageKey(fileName));
    } catch {
      // Ignore storage failures.
    }
  }, [active, fileName]);

  return null;
}
