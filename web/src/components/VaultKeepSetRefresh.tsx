"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  planVaultKeepSetRefresh,
  readVaultKeepSetRefreshAttempt,
  VAULT_KEEP_SET_REFRESH_EVENT,
  vaultKeepSetRefreshStorageKey,
} from "@/lib/vault-file";

/**
 * The redirect after upload can render before Neon has the chats.
 * Refresh until the file is renderable or the attempt budget is spent.
 * `router.refresh()` keeps the same file name, so a local generation
 * re-arms the next wait.
 */
export function VaultKeepSetRefresh({
  active,
  fileName,
}: {
  active: boolean;
  fileName: string;
}) {
  const router = useRouter();
  const [generation, setGeneration] = useState(0);
  const attemptRef = useRef(0);

  useEffect(() => {
    attemptRef.current = 0;
  }, [fileName]);

  useEffect(() => {
    if (!active || !fileName) return;
    const key = vaultKeepSetRefreshStorageKey(fileName);
    const storedAttempt = Math.max(
      readVaultKeepSetRefreshAttempt(fileName),
      attemptRef.current,
    );
    const step = planVaultKeepSetRefresh(storedAttempt);
    const notify = (attempt: number) => {
      window.dispatchEvent(
        new CustomEvent(VAULT_KEEP_SET_REFRESH_EVENT, {
          detail: { fileName, attempt },
        }),
      );
    };
    if (step.kind === "done") {
      notify(storedAttempt);
      return;
    }
    const timer = window.setTimeout(() => {
      attemptRef.current = step.nextAttempt;
      try {
        sessionStorage.setItem(key, String(step.nextAttempt));
      } catch {
        // Private mode still advances the in-memory attempt.
      }
      notify(step.nextAttempt);
      router.refresh();
      setGeneration((current) => current + 1);
    }, step.delayMs);
    return () => window.clearTimeout(timer);
  }, [active, fileName, generation, router]);

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
