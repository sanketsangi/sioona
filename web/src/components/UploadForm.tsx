"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react/ssr";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { FolderIcon } from "@/components/icons/FolderIcon";
import { HexCubeIcon } from "@/components/icons/HexCubeIcon";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { llmQueryExtras, parseLlmPassStats } from "@/lib/detect-llm-query";
import {
  CONFIRM_PARTNER_DEMO_REPLACE_FIELD,
  isPartnerDemoKeepSetActive,
  PARTNER_DEMO_REPLACE_CONFIRM_CODE,
  PARTNER_DEMO_REPLACE_CONFIRM_MESSAGE,
} from "@/lib/partner-demo-replace-guard";
import { lastUploadedFileName as uploadBasename } from "@/lib/upload-filename";
import { livePartnerVaultChrome } from "@/lib/vault-file";
import {
  CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD,
  HELD_OUT_WEEKLY_INGEST_CONFIRM_CODE,
  HELD_OUT_WEEKLY_INGEST_CONFIRM_MESSAGE,
  ingestCatalogOutcomeMessage,
  isHeldOutWeeklyPackBasename,
} from "@/lib/partner-weekly-pack";
import {
  hasSyncFailures,
  parsePredictionSync,
  syncQueryExtras,
  uploadPredictionSyncWarning,
} from "@/lib/prediction-sync";
import { EXPORT_LIMITS, UPLOAD_FILE_ACCEPT } from "@/lib/ingest-constraints";
import { knownUploadJob, resumeUploadJob, uploadJobProgress } from "@/lib/upload-recovery";
import { viewHref } from "@/lib/views";

export { uploadPredictionSyncWarning };

const FORMAT_LABELS: Record<string, string> = {
  sioona_csv: "Sioona CSV",
  sioona_json: "Sioona JSON",
  intercom_json: "Intercom JSON",
  whatsapp_txt: "WhatsApp chat",
  sioona_xlsx: "XLSX workbook",
  email: "Email export",
};

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function uploadErrorMessage(error: string) {
  if (
    error.includes("file first") ||
    /detection|upload progress|cancelled|connection|session|workspace/i.test(error)
  ) {
    return error;
  }
  const stem = error.endsWith(".") ? error.slice(0, -1) : error;
  return `${stem}. Check the file format and try again.`;
}

const EMPTY_UPLOAD_DETAIL = "CSV, JSON, WhatsApp, XLSX, EML, or MBOX…";

/** The carousel file that Upload & Detect will send. Other selections stay local. */
export function activeIngestTarget<T extends { name: string }>(
  files: readonly T[],
  activeIndex: number,
): T | null {
  if (files.length === 0) return null;
  const index =
    Number.isFinite(activeIndex) && activeIndex > 0
      ? Math.min(Math.floor(activeIndex), files.length - 1)
      : 0;
  return files[index] ?? null;
}

/** One file for POST /api/ingest — the active carousel item, never the whole selection. */
export function filesForIngest<T extends { name: string }>(
  files: readonly T[],
  activeIndex: number,
): T[] {
  const active = activeIngestTarget(files, activeIndex);
  return active ? [active] : [];
}

/** Drop-zone copy. Several files name the active one as the ingest target. */
export function uploadActiveFilePrompt(
  fileCount: number,
  activeName: string | null | undefined,
): { heading: string; detail: string } {
  const name = activeName?.trim();
  if (!name || fileCount < 1) {
    return {
      heading: "Choose a file or drop it here",
      detail: EMPTY_UPLOAD_DETAIL,
    };
  }
  if (fileCount > 1) {
    return { heading: "Will ingest", detail: name };
  }
  return { heading: "File selected", detail: name };
}

export function UploadForm({
  hasPartnerExport = false,
  lastUploadedFileName,
  chatCount,
  showDemoActions = true,
}: {
  hasPartnerExport?: boolean;
  lastUploadedFileName?: string;
  /** Loaded chats. Zero keeps Reset and Run Partner Demo during a landing. */
  chatCount?: number;
  /** Hide Reset and Partner Demo when production disables those actions. */
  showDemoActions?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recoveryJob = knownUploadJob(searchParams);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ file: File; detail: string } | null>(null);
  const [pendingPartnerDemoReplace, setPendingPartnerDemoReplace] =
    useState(false);
  const [pendingHeldOutWeeklyIngest, setPendingHeldOutWeeklyIngest] =
    useState(false);

  const pendingJob = useRef<{ id: string; file: string } | null>(recoveryJob);
  const [jobKnown, setJobKnown] = useState(Boolean(recoveryJob));
  const [pendingScopeReplace, setPendingScopeReplace] = useState(false);
  const polling = useRef<AbortController | null>(null);
  useEffect(() => () => polling.current?.abort(), []);

  const [completion, setCompletion] = useState<{ conversations: number; signals: number | null; href: string } | null>(null);

  async function finishQueuedUpload(job: { id: string; file: string }) {
    const controller = new AbortController();
    polling.current?.abort();
    polling.current = controller;
    setStatus("Upload accepted. Detection pending…");
    while (!controller.signal.aborted) {
      const result = await resumeUploadJob(job, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === "succeeded") {
        pendingJob.current = null;
        setJobKnown(false);
        setStatus(null);
        setCompletion({ conversations: result.conversation_count, signals: result.signal_count ?? null,
          href: `/?${new URLSearchParams({ view: "insights", imported: String(result.conversation_count), file: job.file })}` });
        router.refresh();
        return;
      }
      if (["dead_lettered", "cancelled"].includes(result.status)) {
        pendingJob.current = null;
        setJobKnown(false);
        router.replace(viewHref("upload"), { scroll: false });
        setStatus(null);
        throw new Error(result.status === "cancelled" ? "Upload detection was cancelled. Submit the file again to retry." : "Upload detection failed. Submit the file again to retry.");
      }
      setStatus(uploadJobProgress(result));
      await new Promise<void>((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
        const timer = setTimeout(() => { controller.signal.removeEventListener("abort", cancel); resolve(); }, 1000);
        controller.signal.addEventListener("abort", cancel, { once: true });
      });
    }
  }

  const partnerDemoActive = isPartnerDemoKeepSetActive(lastUploadedFileName);
  /** Full-replace path (Day-1 / non–mid-week) can wipe Partner Demo keep-set. */
  const wouldReplace = !hasPartnerExport;
  const activeFile = filesForIngest(files, activeIndex)[0] ?? null;
  const uploadPrompt = uploadActiveFilePrompt(files.length, activeFile?.name);
  const catalogOutcome = activeFile
    ? ingestCatalogOutcomeMessage({
        uploadedBasename: activeFile.name,
        explicitReplace: wouldReplace,
        priorWeeklyExportCount: hasPartnerExport ? 1 : 0,
        lastUploadedFileName,
      })
    : null;
  const heldOutSelected = Boolean(
    activeFile && isHeldOutWeeklyPackBasename(activeFile.name),
  );
  const pendingHeldOutConfirm =
    pendingHeldOutWeeklyIngest && !pendingPartnerDemoReplace;

  const onDemoErrorChange = useCallback((message: string | null) => {
    setDemoError(message);
  }, []);

  function clearPendingConfirm() {
    setPendingScopeReplace(false);
    setPendingPartnerDemoReplace(false);
    setPendingHeldOutWeeklyIngest(false);
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    const next = [...files];
    let firstNew = -1;
    for (const item of incoming) {
      if (next.some((existing) => fileKey(existing) === fileKey(item))) continue;
      if (firstNew < 0) firstNew = next.length;
      next.push(item);
    }
    setFiles(next);
    if (firstNew >= 0) setActiveIndex(firstNew);
    setError(null);
    clearPendingConfirm();
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setActiveIndex((current) => {
      if (current > index) return current - 1;
      if (current === index) return Math.max(0, index - 1);
      return current;
    });
    clearPendingConfirm();
  }

  function showFile(index: number) {
    clearPendingConfirm();
    const next = activeIngestTarget(files, index);
    setActiveIndex(
      files.length === 0
        ? 0
        : Math.min(Math.max(index, 0), files.length - 1),
    );
    if (!next || !isHeldOutWeeklyPackBasename(next.name)) {
      setPendingHeldOutWeeklyIngest(false);
    }
  }

  async function previewMapping() {
    const target = filesForIngest(files, activeIndex)[0];
    if (!target) { fileRef.current?.focus(); return; }
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const body = new FormData();
      body.append("file", target);
      body.append("preview", "true");
      const response = await fetch("/api/ingest", { method: "POST", body });
      const data = await response.json() as { error?: string; previews?: { conversations: number; messages: number; mapping: string; missingTimestampPolicy: string }[] };
      if (!response.ok) throw new Error(data.error || "Preview failed. Check the export and try again.");
      const result = data.previews?.[0];
      if (result) setPreview({ file: target, detail: `${Intl.NumberFormat().format(result.conversations)} conversations, ${Intl.NumberFormat().format(result.messages)} messages. ${result.mapping} ${result.missingTimestampPolicy} Nothing imported; choose Upload & Detect to continue.` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed. Try again.");
    } finally { setLoading(false); }
  }

  async function runIngest(opts?: {
    confirmPartnerDemoReplace?: boolean;
    confirmHeldOutWeeklyIngest?: boolean;
  }) {
    const target = filesForIngest(files, activeIndex)[0] ?? null;
    if (!target && !pendingJob.current) {
      setError("Choose a supported export file first.");
      fileRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    setDemoError(null);
    setStatus(null);
    setHint(null);
    setSyncWarning(null);
    setCompletion(null);
    try {
      if (pendingJob.current) {
        await finishQueuedUpload(pendingJob.current);
        return;
      }
      if (!target) return;
      const body = new FormData();
      body.append("file", target);
      if (!hasPartnerExport) body.append("replace", "true");
      if (opts?.confirmPartnerDemoReplace) {
        body.append(CONFIRM_PARTNER_DEMO_REPLACE_FIELD, "true");
      }
      if (opts?.confirmHeldOutWeeklyIngest) {
        body.append(CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD, "true");
      }
      const res = await fetch("/api/ingest", { method: "POST", body });
      const data = (await res.json()) as {
        job_id?: string;
        accepted?: number;
        error?: string;
        code?: string;
        format?: string;
        importedConversations?: number;
        catalogFiles?: string[];
        newSignals?: number;
        hint?: string;
        predictionSync?: unknown;
        syncError?: string;
        detectLlm?: unknown;
        replaced?: boolean;
      };
      if (
        res.status === 409 &&
        data.code === HELD_OUT_WEEKLY_INGEST_CONFIRM_CODE
      ) {
        setPendingHeldOutWeeklyIngest(true);
        setError(null);
        return;
      }
      if (
        res.status === 409 &&
        data.code === PARTNER_DEMO_REPLACE_CONFIRM_CODE
      ) {
        setPendingPartnerDemoReplace(true);
        setError(null);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Upload failed");
      clearPendingConfirm();
      if (res.status === 202) {
        const file = uploadBasename(target.name);
        if (!data.job_id || !/^[A-Za-z0-9_-]{1,64}$/.test(data.job_id)) throw new Error("Upload job response was invalid.");
        if (!file) throw new Error("Upload file name was invalid.");
        const job = { id: data.job_id, file };
        pendingJob.current = job;
        setJobKnown(true);
        router.replace(viewHref("upload", { uploadJob: job.id, uploadFile: job.file }), { scroll: false });
        await finishQueuedUpload(job);
        return;
      }
      const formatLabel =
        (data.format && FORMAT_LABELS[data.format]) || data.format || "file";
      const imported = data.importedConversations ?? 0;
      const signals = data.newSignals ?? 0;
      const sync = parsePredictionSync(data.predictionSync);
      const syncFailed = hasSyncFailures(sync);

      if (typeof data.syncError === "string" && data.syncError) {
        setSyncWarning(data.syncError);
      }
      if (syncFailed && sync) {
        setStatus(
          `Imported ${imported} conversations via ${formatLabel} · ${signals} signals · sync incomplete`,
        );
        setSyncWarning(uploadPredictionSyncWarning(sync.failed));
      } else {
        setStatus(
          `Imported ${imported} conversations via ${formatLabel} · ${signals} new signals.`,
        );
      }
      if (data.hint) setHint(data.hint);
      router.refresh();
      const query = new URLSearchParams({
        view: "insights",
        imported: String(imported),
        signals: String(signals),
      });
      const extras = syncQueryExtras(sync);
      if (extras.syncFailed) query.set("syncFailed", extras.syncFailed);
      if (extras.syncCreated) query.set("syncCreated", extras.syncCreated);
      const llmExtras = llmQueryExtras(parseLlmPassStats(data.detectLlm));
      if (llmExtras.llmAdded) query.set("llmAdded", llmExtras.llmAdded);
      if (llmExtras.llmFailed) query.set("llmFailed", llmExtras.llmFailed);
      if (llmExtras.llmFailure) query.set("llmFailure", llmExtras.llmFailure);
      // JSON is the keep-set until deferred prune finishes — skip leftover Neon overlay.
      if (data.replaced) query.set("replaced", "1");
      const catalogFiles = data.catalogFiles?.filter(Boolean) ?? [];
      const uploadedName = catalogFiles[0] ?? uploadBasename(target.name);
      if (uploadedName) query.set("file", uploadedName);
      setStatus(null);
      setCompletion({ conversations: imported, signals, href: `/?${query.toString()}` });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (pendingJob.current) { await runIngest(); return; }
    if (files.length === 0) {
      setError("Choose a supported export file first.");
      fileRef.current?.focus();
      return;
    }
    if (heldOutSelected && !pendingHeldOutWeeklyIngest) {
      setError(null);
      setDemoError(null);
      setStatus(null);
      setHint(null);
      setSyncWarning(null);
      setPendingHeldOutWeeklyIngest(true);
      return;
    }
    if (partnerDemoActive && wouldReplace && !pendingPartnerDemoReplace) {
      setError(null);
      setDemoError(null);
      setStatus(null);
      setHint(null);
      setSyncWarning(null);
      setPendingPartnerDemoReplace(true);
      return;
    }
    if (wouldReplace && (chatCount ?? 0) > 0 && !pendingScopeReplace && !pendingPartnerDemoReplace) { setPendingScopeReplace(true); return; }
    await runIngest({
      confirmPartnerDemoReplace: pendingPartnerDemoReplace && partnerDemoActive,
      confirmHeldOutWeeklyIngest: pendingHeldOutWeeklyIngest && heldOutSelected,
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex h-full min-h-0 flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-5 sm:py-8 lg:px-6 lg:py-10"
    >
      <div className="flex shrink-0 flex-col items-center gap-4 text-center">
        <div
          className="flex size-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base"
          aria-hidden
        >
          <HexCubeIcon variant="large" className="size-[58px] shrink-0" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-balance text-center text-heading-20 text-sio-fg-base">
            Get started with <span translate="no">Sioona</span>
          </h2>
          <p className="text-center text-copy-14 text-sio-fg-base">
            Upload a chat export to detect signals you can review in{" "}
            <span translate="no">Sioona</span> Insights.
          </p>
        </div>
      </div>

      <div className="relative flex min-h-56 flex-1 flex-col items-center justify-center gap-3 rounded-[var(--radius-control)] border border-dashed border-sio-border-subtle bg-sio-bg-muted/60 px-4 py-10 text-center touch-manipulation hover:bg-sio-bg-interactive focus-within:shadow-[var(--focus-ring)]">
        <FolderIcon className="size-16 shrink-0 text-sio-fg-subtle" />
        <Label
          htmlFor="chat-export"
          className="cursor-pointer text-copy-14 font-normal text-sio-fg-base"
        >
          {uploadPrompt.heading}
        </Label>
        <p
          className="max-w-full truncate text-label-13 text-sio-fg-subtle"
          translate={activeFile ? "no" : undefined}
        >
          {uploadPrompt.detail}
        </p>
        {files.length > 0 ? (
          <div className="relative z-20 flex items-center justify-center gap-1">
            {files.length > 1 ? (
              <>
                <button
                  type="button"
                  className="inline-flex size-11 md:size-8 touch-manipulation items-center justify-center rounded-[var(--radius-control)] text-sio-fg-subtle hover:bg-sio-bg-interactive hover:text-sio-fg-base focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50"
                  aria-label="Previous file"
                  disabled={loading || jobKnown || activeIndex <= 0}
                  onClick={() => showFile(activeIndex - 1)}
                >
                  <CaretLeft className="size-4" weight="regular" aria-hidden />
                </button>
                <p className="tabular min-w-[4.5rem] text-center text-label-12 text-sio-fg-subtle">
                  <span className="sr-only">
                    Will ingest {activeFile?.name ?? "file"}. File{" "}
                  </span>
                  {Math.min(activeIndex, files.length - 1) + 1} of {files.length}
                </p>
                <button
                  type="button"
                  className="inline-flex size-11 md:size-8 touch-manipulation items-center justify-center rounded-[var(--radius-control)] text-sio-fg-subtle hover:bg-sio-bg-interactive hover:text-sio-fg-base focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50"
                  aria-label="Next file"
                  disabled={loading || jobKnown || activeIndex >= files.length - 1}
                  onClick={() => showFile(activeIndex + 1)}
                >
                  <CaretRight className="size-4" weight="regular" aria-hidden />
                </button>
              </>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 md:size-8 touch-manipulation"
              disabled={loading || jobKnown}
              aria-label={`Remove ${activeFile?.name ?? "file"}`}
              onClick={() => removeFile(activeIndex)}
            >
              <X className="size-4" weight="regular" aria-hidden />
            </Button>
          </div>
        ) : null}
        <Input
          ref={fileRef}
          id="chat-export"
          name="file"
          type="file"
          multiple
          accept={UPLOAD_FILE_ACCEPT}
          disabled={loading || jobKnown}
          aria-describedby="upload-constraints upload-error"
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            addFiles(e.target.files);
          }}
          className="absolute inset-0 z-10 h-full min-h-full w-full cursor-pointer rounded-[var(--radius-control)] border-0 bg-transparent p-0 opacity-0 file:hidden focus-visible:border-0 focus-visible:ring-0"
        />
      </div>

      {completion ? <div className="panel flex flex-wrap items-center gap-2 p-3" role="status" aria-label="Upload complete">
        <span className="rounded-full border border-sio-border-subtle bg-sio-bg-muted px-2.5 py-0.5 text-label-12">{Intl.NumberFormat().format(completion.conversations)} conversations</span>
        <span className="rounded-full border border-sio-border-subtle bg-sio-bg-muted px-2.5 py-0.5 text-label-12">{completion.signals === null ? "Signal count unavailable" : `${Intl.NumberFormat().format(completion.signals)} signals`}</span>
        {syncWarning ? <span className="rounded-full border border-sio-border-subtle bg-sio-bg-muted px-2.5 py-0.5 text-label-12">Sync incomplete</span> : null}
        <Link href={completion.href} className="btn-primary ml-auto">Review signals →</Link>
      </div> : null}
      <div className="flex shrink-0 flex-col gap-3">
        <p id="upload-constraints" className="text-copy-14 text-sio-fg-subtle">CSV, JSON, WhatsApp TXT, XLSX, EML or MBOX. Up to {EXPORT_LIMITS.fileBytes / (1024 * 1024)} MiB per file; {Intl.NumberFormat().format(EXPORT_LIMITS.rows)} message rows; {Intl.NumberFormat().format(EXPORT_LIMITS.messageChars)} characters per message. One selected file is imported at a time.</p>
        {activeFile ? <p className="text-copy-14 text-sio-fg-subtle">Selected: <span translate="no" className="break-all">{activeFile.name}</span> · {Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(activeFile.size / 1024)} KiB</p> : null}
        {jobKnown ? <p className="text-copy-14 text-sio-fg-subtle">Upload accepted. Leaving stops this screen’s progress checks, not server processing. Resume checking the existing job here; no new detection is created.</p> : null}
        {pendingScopeReplace ? <p role="alert" className="status-banner status-banner-warning">Replace the current workspace corpus ({Intl.NumberFormat().format(chatCount ?? 0)} conversations) and its signals/reviews? Cancel keeps the file selected and imports nothing.</p> : null}
        {preview && preview.file === activeFile ? <p className="break-words text-copy-14" role="status" aria-live="polite">{preview.detail}</p> : null}
        {activeFile && !jobKnown ? (
          <button type="button" onClick={previewMapping} disabled={loading} aria-busy={loading} className="btn-secondary min-h-11 touch-manipulation">
            {loading ? <ButtonSpinner /> : null}Preview mapping
          </button>
        ) : null}
        {catalogOutcome ? (
          <p
            className="text-center text-pretty text-copy-14 text-sio-fg-base"
            role="status"
          >
            {catalogOutcome}
          </p>
        ) : null}
        <div className="relative flex flex-wrap items-center justify-center gap-2">
          {pendingScopeReplace || pendingPartnerDemoReplace || pendingHeldOutWeeklyIngest ? (
            <>
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="btn-primary rounded-[var(--radius-panel)]"
              >
                {loading ? <ButtonSpinner /> : null}
                {pendingScopeReplace || pendingPartnerDemoReplace ? "Confirm Replace" : "Confirm Ingest"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={clearPendingConfirm}
                className="btn-secondary rounded-[var(--radius-panel)]"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="btn-primary rounded-[var(--radius-panel)]"
              >
                {loading ? (
                  <ButtonSpinner />
                ) : (
                  <ArrowCircleUpIcon className="size-3.5 shrink-0" />
                )}
                {jobKnown ? "Resume checking upload" : "Upload & Detect"}
              </button>
              {showDemoActions &&
              !livePartnerVaultChrome({
                lastUploadedFileName,
                chatCount,
              }) ? (
                <>
                  <PartnerDemoButton
                    label="Run Partner Demo"
                    lastUploadedFileName={lastUploadedFileName}
                    className="btn-secondary rounded-[var(--radius-panel)]"
                    onErrorChange={onDemoErrorChange}
                  />
                  <ResetDemoButton
                    lastUploadedFileName={lastUploadedFileName}
                    onErrorChange={onDemoErrorChange}
                  />
                </>
              ) : null}
            </>
          )}
          <div
            id="upload-error"
            className="basis-full"
            aria-live="polite"
            aria-atomic="true"
          >
            {error ? (
              <p
                role="alert"
                className="rounded-[var(--radius-control)] bg-sio-status-danger-bg px-3 py-2 text-copy-14 text-pretty text-sio-status-danger-fg"
              >
                {uploadErrorMessage(error)}
              </p>
            ) : null}
          </div>
        </div>
        {pendingPartnerDemoReplace ? (
          <div className="status-banner status-banner-warning" role="alert">
            <p className="text-copy-14 text-sio-fg-base" aria-live="polite">
              {PARTNER_DEMO_REPLACE_CONFIRM_MESSAGE}
            </p>
          </div>
        ) : pendingHeldOutConfirm ? (
          <div className="status-banner status-banner-warning" role="alert">
            <p className="text-copy-14 text-sio-fg-base" aria-live="polite">
              {HELD_OUT_WEEKLY_INGEST_CONFIRM_MESSAGE}
            </p>
          </div>
        ) : null}
        {demoError ? (
          <div className="status-banner status-banner-warning" role="alert">
            <p className="text-copy-14 text-sio-fg-base" aria-live="polite">
              {demoError}. Try again.
            </p>
          </div>
        ) : null}
        <div className="sr-only" aria-live="polite">
          {status ?? (loading ? "Uploading…" : "")}
        </div>
        {status ? (
          <p
            className={`text-copy-14 ${
              syncWarning || !status.startsWith("Imported")
                ? "text-sio-fg-base"
                : "text-sio-status-success-fg"
            }`}
          >
            {status}
          </p>
        ) : null}
        {syncWarning ? (
          <div className="status-banner status-banner-warning" role="alert">
            <p className="text-copy-14 text-sio-fg-base">{syncWarning}</p>
          </div>
        ) : null}
        {hint ? (
          <div className="status-banner status-banner-warning" role="status">
            <p className="text-copy-14 text-sio-fg-base">{hint}</p>
            {showDemoActions ? (
              <p className="mt-2 text-label-13 text-sio-fg-subtle">
                <Link href={viewHref("insights")} className="link-accent">
                  Start Partner Demo
                </Link>{" "}
                for sample support chats that already score.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
