"use client";

import { useEffect, useState } from "react";
import { BoltIcon } from "@/components/icons/BoltIcon";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  UPLOAD_TIP_INTERVAL_MS,
  UPLOAD_TIPS,
  nextUploadTipIndex,
} from "@/lib/upload-tips";
import { cn } from "@/lib/utils";

/**
 * Always-visible rotating tips under the Upload panel — quiet single-line pill
 * (secondary chrome look, not interactive). Reduced motion: swap, no word-appear.
 */
export function UploadTips({ className }: { className?: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((current) => nextUploadTipIndex(current));
    }, UPLOAD_TIP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const tip = UPLOAD_TIPS[index] ?? UPLOAD_TIPS[0];
  const words = tip.split(/\s+/).filter(Boolean);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-5xl shrink-0 justify-center px-1 pt-3 sm:pt-4",
        className,
      )}
    >
      <p
        title={tip}
        className="inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-sio-border-subtle bg-sio-bg-base px-3 text-label-13"
      >
        <BoltIcon className="size-4 shrink-0 text-sio-fg-subtle" />
        <span className="shrink-0 font-medium text-sio-fg-base">Tips</span>
        <span className="min-w-0 truncate text-sio-fg-subtle">
          {reducedMotion ? (
            tip
          ) : (
            <span key={index} className="inline">
              {words.map((word, wordIndex) => (
                <span
                  key={`${index}-${wordIndex}`}
                  className="sio-word-appear inline-block"
                  style={{
                    animationDelay: `${wordIndex * 40}ms`,
                  }}
                >
                  {word}
                  {wordIndex < words.length - 1 ? "\u00A0" : null}
                </span>
              ))}
            </span>
          )}
        </span>
      </p>
    </div>
  );
}
