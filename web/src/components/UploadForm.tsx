"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { FolderIcon } from "@/components/icons/FolderIcon";
import { HexCubeIcon } from "@/components/icons/HexCubeIcon";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { llmQueryExtras, parseLlmPassStats } from "@/lib/detect-llm-query";
import {
  CONFIRM_PARTNER_DEMO_REPLACE_FIELD,
  isPartnerDemoKeepSetActive,
  PARTNER_DEMO_REPLACE_CONFIRM_CODE,
  PARTNER_DEMO_REPLACE_CONFIRM_MESSAGE,
} from "@/lib/partner-demo-replace-guard";
import {
  CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD,
  HELD_OUT_WEEKLY_INGEST_CONFIRM_CODE,
  HELD_OUT_WEEKLY_INGEST_CONFIRM_MESSAGE,
  isHeldOutWeeklyPackBasename,
} from "@/lib/partner-weekly-pack";
import {
  hasSyncFailures,
  parsePredictionSync,
  syncQueryExtras,
} from "@/lib/prediction-sync";
import { viewHref } from "@/lib/views";

const FORMAT_LABELS: Record<string, string> = {
  sioona_csv: "Sioona CSV",
  sioona_json: "Sioona JSON",
  intercom_json: "Intercom JSON",
  whatsapp_txt: "WhatsApp chat",
};

const FILE_ACCEPT = ".csv,.json,.txt,text/csv,application/json,text/plain";

export function UploadForm({
  hasPartnerExport = false,
  lastUploadedFileName,
}: {
  hasPartnerExport?: boolean;
  lastUploadedFileName?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingPartnerDemoReplace, setPendingPartnerDemoReplace] =
    useState(false);
  const [pendingHeldOutWeeklyIngest, setPendingHeldOutWeeklyIngest] =
    useState(false);

  const partnerDemoActive = isPartnerDemoKeepSetActive(lastUploadedFileName);
  /** Full-replace path (Day-1 / non–mid-week) can wipe Partner Demo keep-set. */
  const wouldReplace = !hasPartnerExport;
  const heldOutSelected = isHeldOutWeeklyPackBasename(file?.name);
  const pendingHeldOutConfirm =
    pendingHeldOutWeeklyIngest && !pendingPartnerDemoReplace;

  const onDemoErrorChange = useCallback((message: string | null) => {
    setDemoError(message);
  }, []);

  function clearPendingConfirm() {
    setPendingPartnerDemoReplace(false);
    setPendingHeldOutWeeklyIngest(false);
  }

  async function runIngest(opts?: {
    confirmPartnerDemoReplace?: boolean;
    confirmHeldOutWeeklyIngest?: boolean;
  }) {
    if (!file) {
      setError("Choose a CSV, JSON, or WhatsApp .txt file first.");
      fileRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    setDemoError(null);
    setStatus(null);
    setHint(null);
    setSyncWarning(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (!hasPartnerExport) body.append("replace", "true");
      if (opts?.confirmPartnerDemoReplace) {
        body.append(CONFIRM_PARTNER_DEMO_REPLACE_FIELD, "true");
      }
      if (opts?.confirmHeldOutWeeklyIngest) {
        body.append(CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD, "true");
      }
      const res = await fetch("/api/ingest", { method: "POST", body });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        format?: string;
        importedConversations?: number;
        newSignals?: number;
        hint?: string;
        predictionSync?: unknown;
        detectLlm?: unknown;
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
      const formatLabel =
        (data.format && FORMAT_LABELS[data.format]) || data.format || "file";
      const imported = data.importedConversations ?? 0;
      const signals = data.newSignals ?? 0;
      const sync = parsePredictionSync(data.predictionSync);
      const syncFailed = hasSyncFailures(sync);

      if (syncFailed && sync) {
        setStatus(
          `Imported ${imported} conversations via ${formatLabel} · ${signals} local signals — Neon sync incomplete`,
        );
        setSyncWarning(
          `${sync.failed} prediction${sync.failed === 1 ? "" : "s"} not written to Neon. Check BACKEND_URL / FastAPI, then Re-run Detection on Insights.`,
        );
      } else {
        setStatus(
          `Imported ${imported} conversations via ${formatLabel} · ${signals} new signals. Opening Insights…`,
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
      setTimeout(() => router.push(`/?${query.toString()}`), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a CSV, JSON, or WhatsApp .txt file first.");
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
          {file ? "File selected" : "Choose a file or drop it here"}
        </Label>
        <p
          className="max-w-full truncate text-label-13 text-sio-fg-subtle"
          translate={file ? "no" : undefined}
        >
          {file ? file.name : "CSV, JSON, or WhatsApp .txt…"}
        </p>
        <Input
          ref={fileRef}
          id="chat-export"
          name="file"
          type="file"
          accept={FILE_ACCEPT}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            clearPendingConfirm();
          }}
          className="absolute inset-0 z-10 h-full min-h-full w-full cursor-pointer rounded-[var(--radius-control)] border-0 bg-transparent p-0 opacity-0 file:hidden focus-visible:border-0 focus-visible:ring-0"
        />
      </div>

      <div className="flex shrink-0 flex-col gap-3">
        <div className="relative flex flex-wrap items-center justify-center gap-2">
          {pendingPartnerDemoReplace || pendingHeldOutWeeklyIngest ? (
            <>
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="btn-primary rounded-[var(--radius-panel)]"
              >
                {loading ? <ButtonSpinner /> : null}
                {pendingPartnerDemoReplace ? "Confirm Replace" : "Confirm Ingest"}
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
                Upload & Detect
              </button>
              <PartnerDemoButton
                label="Run Partner Demo"
                className="btn-secondary rounded-[var(--radius-panel)]"
                onErrorChange={onDemoErrorChange}
              />
              <ResetDemoButton />
            </>
          )}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-full z-20 mb-2 flex justify-center"
            aria-live="polite"
            aria-atomic="true"
          >
            {error ? (
              <p
                role="alert"
                className="max-w-[min(100%,20rem)] rounded-full bg-sio-status-danger-bg px-3 py-1 text-center font-sans font-medium text-copy-14 text-pretty text-sio-status-danger-fg"
              >
                {error}. Check the file format and try again.
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
              {demoError}. Try Run Partner Demo again.
            </p>
          </div>
        ) : null}
        <div className="sr-only" aria-live="polite">
          {loading ? "Uploading…" : (status ?? "")}
        </div>
        {status ? (
          <p
            className={`text-copy-14 ${
              syncWarning ? "text-sio-fg-base" : "text-sio-status-success-fg"
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
            <p className="mt-2 text-label-13 text-sio-fg-subtle">
              <Link href={viewHref("insights")} className="link-accent">
                Start Partner Demo
              </Link>{" "}
              for sample support chats that already score.
            </p>
          </div>
        ) : null}
      </div>
    </form>
  );
}
