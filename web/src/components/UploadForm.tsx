"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { viewHref } from "@/lib/views";

const FORMAT_LABELS: Record<string, string> = {
  sioona_csv: "Sioona CSV",
  sioona_json: "Sioona JSON",
  intercom_json: "Intercom JSON",
  whatsapp_txt: "WhatsApp chat",
};

export function UploadForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a CSV, JSON, or WhatsApp .txt file first.");
      fileRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);
    setHint(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body });
      const data = (await res.json()) as {
        error?: string;
        format?: string;
        importedConversations?: number;
        newSignals?: number;
        hint?: string;
      };
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const formatLabel =
        (data.format && FORMAT_LABELS[data.format]) || data.format || "file";
      const imported = data.importedConversations ?? 0;
      const signals = data.newSignals ?? 0;
      setStatus(
        `Imported ${imported} conversations via ${formatLabel} · ${signals} new signals`
      );
      if (data.hint) setHint(data.hint);
      router.refresh();
      const query = new URLSearchParams({
        view: "insights",
        imported: String(imported),
        signals: String(signals),
      });
      setTimeout(() => router.push(`/?${query.toString()}`), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`panel flex h-full flex-col ${compact ? "p-4 sm:p-5" : "p-6 sm:p-8"}`}
    >
      <p className="eyebrow shrink-0">Import</p>
      <label
        htmlFor="chat-export"
        className="mt-1 block shrink-0 text-heading-16 text-ds-gray-1000"
      >
        Chat Export
      </label>
      <p className="mt-2 shrink-0 text-copy-14 text-ds-gray-900">
        CSV, JSON, or WhatsApp .txt. Best results: support chats with lead,
        churn, or upgrade language.
      </p>
      <input
        ref={fileRef}
        id="chat-export"
        name="file"
        type="file"
        accept=".csv,.json,.txt,text/csv,application/json,text/plain"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="file-input mt-4 shrink-0"
      />
      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="btn-primary mt-4 shrink-0"
      >
        {loading ? <ButtonSpinner /> : <Upload className="size-3.5" strokeWidth={1.5} aria-hidden />}
        Upload & Detect
      </button>
      <div className="sr-only" aria-live="polite">
        {loading ? "Uploading…" : status ?? ""}
      </div>
      {status ? (
        <p className="mt-3 shrink-0 text-copy-14 text-ds-green-900">{status}</p>
      ) : null}
      {hint ? (
        <div
          className="status-banner status-banner-warning mt-3 shrink-0"
          role="status"
        >
          <p className="text-copy-14 text-ds-gray-1000">{hint}</p>
          <p className="mt-2 text-label-13 text-ds-gray-900">
            <Link href={viewHref("insights")} className="link-accent">
              Start Partner Demo
            </Link>{" "}
            for sample support chats that already score.
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 shrink-0 text-copy-14 text-ds-red-900" role="alert">
          {error}. Check the file format and try again.
        </p>
      ) : null}
    </form>
  );
}
