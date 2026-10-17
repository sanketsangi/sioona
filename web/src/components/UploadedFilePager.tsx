"use client";

import { useSearchParams } from "next/navigation";
import { corpusSwitchHref } from "@/lib/workspace-navigation";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { PagerIconLink } from "@/components/PagerIconLink";
import { uploadedFileIndex } from "@/lib/vault-file";

/**
 * Previous / next between files from one real export.
 * Hidden until the catalog has at least two names and `current` is one of them.
 */
export function UploadedFilePager({
  files,
  current,
}: {
  files: readonly string[];
  current?: string | null;
}) {
  const searchParams = useSearchParams();
  if (files.length < 2) return null;
  const index = uploadedFileIndex(files, current);
  if (index < 0) return null;
  const prev = index > 0 ? files[index - 1] : null;
  const next = index < files.length - 1 ? files[index + 1] : null;

  return (
    <nav
      aria-label="Uploaded files"
      className="flex shrink-0 items-center gap-1"
    >
      <PagerIconLink
        href={prev ? corpusSwitchHref(prev, searchParams) : null}
        label="Previous file"
      >
        <CaretLeft className="size-4" weight="regular" aria-hidden />
      </PagerIconLink>
      <p className="tabular min-w-[4.5rem] text-center text-label-12 text-sio-fg-subtle">
        <span className="sr-only">File </span>
        {index + 1} of {files.length}
      </p>
      <PagerIconLink
        href={next ? corpusSwitchHref(next, searchParams) : null}
        label="Next file"
      >
        <CaretRight className="size-4" weight="regular" aria-hidden />
      </PagerIconLink>
    </nav>
  );
}
