"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { FolderIcon } from "@/components/icons/FolderIcon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  llmQueryExtras,
  parseLlmPassStats,
} from "@/lib/detect-llm-query";
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
}: {
  hasPartnerExport?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a CSV, JSON, or WhatsApp .txt file first.");
      setConfirming(false);
      fileRef.current?.focus();
      return;
    }
    if (!hasPartnerExport && !confirming) {
      setError(null);
      setConfirming(true);
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);
    setHint(null);
    setSyncWarning(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (!hasPartnerExport) body.append("replace", "true");
      const res = await fetch("/api/ingest", { method: "POST", body });
      const data = (await res.json()) as {
        error?: string;
        format?: string;
        importedConversations?: number;
        newSignals?: number;
        hint?: string;
        predictionSync?: unknown;
        detectLlm?: unknown;
      };
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const formatLabel =
        (data.format && FORMAT_LABELS[data.format]) || data.format || "file";
      const imported = data.importedConversations ?? 0;
      const signals = data.newSignals ?? 0;
      const sync = parsePredictionSync(data.predictionSync);
      const syncFailed = hasSyncFailures(sync);

      if (syncFailed && sync) {
        setStatus(
          `Imported ${imported} conversations via ${formatLabel} · ${signals} local signals — Neon sync incomplete`
        );
        setSyncWarning(
          `${sync.failed} prediction${sync.failed === 1 ? "" : "s"} not written to Neon. Check BACKEND_URL / FastAPI, then Re-run Detection on Insights.`
        );
      } else {
        setStatus(
          `Imported ${imported} conversations via ${formatLabel} · ${signals} new signals. Opening Insights…`
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
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex h-full min-h-0 flex-col gap-6 p-4 sm:p-5 lg:p-6"
    >
      <div className="flex shrink-0 flex-col gap-2">
        <p className="eyebrow">Import</p>
        <Label
          htmlFor="chat-export"
          className="text-heading-16 font-medium text-sio-fg-base"
        >
          Chat Export
        </Label>
        <p className="text-copy-14 text-balance text-sio-fg-subtle">
          CSV, JSON, or WhatsApp .txt. Best results: support chats with lead,
          churn, or upgrade language.
        </p>
      </div>

      <div className="relative flex min-h-44 flex-1 flex-col items-center justify-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-sio-border-base bg-sio-bg-muted/60 px-4 py-8 text-center touch-manipulation hover:bg-sio-bg-interactive focus-within:shadow-[var(--focus-ring)]">
        <FolderIcon className="size-16 shrink-0 text-sio-fg-subtle" />
        <p className="text-copy-14 text-sio-fg-base">
          {file ? "File selected" : "Choose a file or drop it here"}
        </p>
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
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="absolute inset-0 z-10 h-full min-h-full w-full cursor-pointer rounded-[var(--radius-panel)] border-0 bg-transparent p-0 opacity-0 file:hidden focus-visible:border-0 focus-visible:ring-0"
        />
      </div>

      <div className="flex shrink-0 flex-col gap-3">
        {confirming && !hasPartnerExport ? (
          <div className="flex flex-col gap-3">
            <p className="text-copy-14 text-sio-fg-base" role="status">
              Replace current chats with this file. Later re-uploads update
              matching conversations.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                ref={confirmRef}
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="btn-primary"
              >
                {loading ? <ButtonSpinner /> : null}
                Confirm Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  submitRef.current?.focus();
                }}
                disabled={loading}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={submitRef}
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="btn-primary"
          >
            {loading ? (
              <ButtonSpinner />
            ) : (
              <ArrowCircleUpIcon className="size-3.5 shrink-0" />
            )}
            Upload & Detect
          </button>
        )}
        <div className="sr-only" aria-live="polite">
          {loading ? "Uploading…" : status ?? ""}
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
        {error ? (
          <p className="text-copy-14 text-sio-status-danger-fg" role="alert">
            {error}. Check the file format and try again.
          </p>
        ) : null}
      </div>
    </form>
  );
}
