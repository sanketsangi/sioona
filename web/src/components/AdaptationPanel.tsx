"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { EmptyState } from "@/components/EmptyState";
import { Pager } from "@/components/Pager";
import { signalTypeLabel } from "@/lib/format";
import { parsePage, viewHref } from "@/lib/views";
import type { Signal, SignalType, TaxonomyOverrides } from "@/lib/types";

type OverrideField = "phrases" | "negativePhrases";

const PAGE_SIZE = 2;

function suggestTerm(signal: Signal): string {
  if (signal.feedback?.note?.trim()) {
    return signal.feedback.note.trim().slice(0, 80);
  }
  // Prefer short match terms over long customer quotes for override drafts.
  const match = signal.evidence.find(
    (e) => e.startsWith("phrase: ") || e.startsWith("keyword: ")
  );
  if (match) {
    const captured = match.match(/"([^"]+)"/);
    if (captured?.[1]) return captured[1];
  }
  const quote = signal.evidence.find((e) => e.startsWith("quote: "));
  if (quote) {
    const captured = quote.match(/"([^"]+)"/);
    if (captured?.[1]) return captured[1].slice(0, 80);
  }
  return "";
}

export function AdaptationPanel({
  signals,
  taxonomyOverrides,
  compact = false,
  adaptPageRaw,
}: {
  signals: Signal[];
  taxonomyOverrides: TaxonomyOverrides;
  compact?: boolean;
  adaptPageRaw?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const signal of signals) {
      initial[signal.id] = suggestTerm(signal);
    }
    return initial;
  });

  const reviewSignals = signals.filter(
    (s) =>
      s.feedback?.label === "incorrect" ||
      s.feedback?.label === "partially_correct"
  );

  const draftsDirty = reviewSignals.some((s) => {
    const current = (drafts[s.id] ?? "").trim();
    const suggested = suggestTerm(s).trim();
    return current !== suggested && current.length > 0;
  });

  useEffect(() => {
    if (!draftsDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draftsDirty]);

  const pageCount = Math.max(1, Math.ceil(reviewSignals.length / PAGE_SIZE));
  const page = Math.min(parsePage(adaptPageRaw), pageCount);
  const pageItems = reviewSignals.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  function focusOverrideInput(signalId: string) {
    // Mobile card + desktop table both render a `override-<id>` input;
    // only one is visible per breakpoint, so focus whichever isn't hidden.
    const candidates = document.querySelectorAll<HTMLInputElement>(
      `input[name="override-${signalId}"]`
    );
    for (const candidate of candidates) {
      if (candidate.offsetParent !== null) {
        candidate.focus();
        break;
      }
    }
  }

  async function applyScoredAdapt() {
    setError(null);
    setSuccess(null);
    setBusyId("apply-scored-adapt");
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_partner_export_adapt" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to apply scored Adapt");
      }
      setSuccess(
        `Applied scored Adapt and re-ran detection${
          typeof data.redetectCount === "number"
            ? ` (${data.redetectCount} signals)`
            : ""
        }.`
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to apply scored Adapt"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function applyZerodhaBatch01Adapt() {
    setError(null);
    setSuccess(null);
    setBusyId("apply-zerodha-adapt");
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_zerodha_batch01_adapt" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to apply Zerodha Adapt");
      }
      setSuccess(
        `Applied Zerodha batch_01 Adapt and re-ran detection${
          typeof data.redetectCount === "number"
            ? ` (${data.redetectCount} signals)`
            : ""
        }.`
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to apply Zerodha Adapt"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function applyOverride(
    signal: Signal,
    field: OverrideField,
    type: SignalType
  ) {
    const value = (drafts[signal.id] ?? "").trim();
    if (!value) {
      setError("Enter a phrase or negative term first.");
      focusOverrideInput(signal.id);
      return;
    }
    setError(null);
    setSuccess(null);
    setBusyId(`${signal.id}:${field}`);
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_taxonomy_override",
          type,
          field,
          value,
          redetect: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add override");
      }
      const kind = field === "phrases" ? "phrase" : "negative";
      setSuccess(
        `Added ${kind} “${value}” for ${signalTypeLabel(type)} and re-ran detection${
          typeof data.redetectCount === "number"
            ? ` (${data.redetectCount} signals)`
            : ""
        }.`
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add override");
    } finally {
      setBusyId(null);
    }
  }

  const overrideRows = (["lead", "retention", "upsell"] as SignalType[]).flatMap(
    (type) => {
      const o = taxonomyOverrides[type];
      if (!o) return [];
      const rows: { type: SignalType; field: string; value: string }[] = [];
      for (const value of o.phrases ?? []) {
        rows.push({ type, field: "phrase", value });
      }
      for (const value of o.keywords ?? []) {
        rows.push({ type, field: "keyword", value });
      }
      for (const value of o.negativePhrases ?? []) {
        rows.push({ type, field: "negative", value });
      }
      return rows;
    }
  );

  return (
    <div
      className={`panel flex min-h-0 flex-1 flex-col overflow-hidden ${compact ? "" : "mt-6"}`}
    >
      <div className="shrink-0 border-b border-sio-border-base px-3 py-2.5 sm:px-4">
        <h2 className="text-balance text-heading-16 text-sio-fg-base">
          Adapt From Reviews
        </h2>
        <p className="mt-1 text-label-13 text-sio-fg-muted">
          Reject → Add Negative (stop false positives). Wrong reason / miss →
          Add Phrase. Each change re-detects immediately.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={pending || busyId !== null}
            aria-busy={busyId === "apply-scored-adapt"}
            onClick={() => void applyScoredAdapt()}
          >
            {busyId === "apply-scored-adapt" ? <ButtonSpinner /> : null}
            Apply Scored Adapt
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={pending || busyId !== null}
            aria-busy={busyId === "apply-zerodha-adapt"}
            onClick={() => void applyZerodhaBatch01Adapt()}
          >
            {busyId === "apply-zerodha-adapt" ? <ButtonSpinner /> : null}
            Apply Zerodha Adapt
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {success ? (
          <p className="shrink-0 border-b border-sio-border-base px-3 py-2 text-copy-14 text-sio-status-success-fg sm:px-4">
            {success}
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          className="shrink-0 border-b border-sio-border-base px-3 py-2 text-copy-14 text-sio-status-danger-fg sm:px-4"
          role="alert"
        >
          {error} Fix the term and try again.
        </p>
      ) : null}

      {overrideRows.length > 0 ? (
        <div className="shrink-0 border-b border-sio-border-base px-3 py-2 sm:px-4">
          <h3 className="eyebrow">Active Overrides</h3>
          <ul className="mt-1.5 space-y-0.5 text-copy-14 text-sio-fg-base">
            {overrideRows.slice(0, 3).map((row) => (
              <li
                key={`${row.type}-${row.field}-${row.value}`}
                className="truncate"
              >
                {signalTypeLabel(row.type)} · {row.field}: “{row.value}”
              </li>
            ))}
            {overrideRows.length > 3 ? (
              <li className="text-label-13 text-sio-fg-muted">
                +{overrideRows.length - 3} more
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {reviewSignals.length === 0 ? (
        <EmptyState
          title="No Feedback to Adapt"
          description="No incorrect or partially correct reviews yet. Confirm detections in Insights, then return here to tune phrases."
        >
          <Link href={viewHref("insights")} className="btn-primary mt-4">
            Open Insights
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="scroll-region min-h-0 flex-1">
            {/* Card list below md — table columns clip inputs/actions on narrow viewports */}
            <ul className="divide-y divide-sio-border-base md:hidden">
              {pageItems.map((signal) => (
                <li key={signal.id} className="px-3 py-3 sm:px-4">
                  <Link
                    href={viewHref("insights", { preview: signal.id })}
                    className="link-accent"
                  >
                    {signalTypeLabel(signal.type)}
                  </Link>
                  <span className="ml-2 text-label-13 text-sio-fg-subtle">
                    {signal.feedback?.label.replace("_", " ")}
                  </span>
                  <div className="mt-1 line-clamp-1 text-label-13 text-sio-fg-muted">
                    {signal.evidence.slice(0, 1).join(" · ") || "No evidence"}
                  </div>
                  <label className="mt-2.5 block min-w-0">
                    <span className="sr-only">
                      Override term for {signalTypeLabel(signal.type)}
                    </span>
                    <input
                      type="text"
                      name={`override-${signal.id}`}
                      autoComplete="off"
                      spellCheck={false}
                      value={drafts[signal.id] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [signal.id]: e.target.value,
                        }))
                      }
                      className="input-field w-full"
                      disabled={pending || busyId !== null}
                      placeholder="e.g. cancel my account…"
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={pending || busyId !== null}
                      aria-busy={busyId === `${signal.id}:phrases`}
                      onClick={() =>
                        applyOverride(signal, "phrases", signal.type)
                      }
                    >
                      {busyId === `${signal.id}:phrases` ? (
                        <ButtonSpinner />
                      ) : null}
                      Add Phrase
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={pending || busyId !== null}
                      aria-busy={busyId === `${signal.id}:negativePhrases`}
                      onClick={() =>
                        applyOverride(signal, "negativePhrases", signal.type)
                      }
                    >
                      {busyId === `${signal.id}:negativePhrases` ? (
                        <ButtonSpinner />
                      ) : null}
                      Add Negative
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Table at md+ — columns have room to breathe */}
            <table className="hidden w-full text-left text-copy-14 md:table">
              <thead className="border-b border-sio-border-base">
                <tr>
                  <th className="px-4 py-2 text-label-12 font-medium text-sio-fg-subtle">
                    Signal
                  </th>
                  <th className="px-4 py-2 text-label-12 font-medium text-sio-fg-subtle">
                    Feedback
                  </th>
                  <th className="px-4 py-2 text-label-12 font-medium text-sio-fg-subtle">
                    Term
                  </th>
                  <th className="px-4 py-2 text-label-12 font-medium text-sio-fg-subtle">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sio-border-base">
                {pageItems.map((signal) => (
                  <tr key={signal.id}>
                    <td className="min-w-0 px-4 py-2.5 align-top text-sio-fg-base">
                      <Link
                        href={viewHref("insights", { preview: signal.id })}
                        className="link-accent"
                      >
                        {signalTypeLabel(signal.type)}
                      </Link>
                      <div className="mt-1 line-clamp-1 text-label-13 text-sio-fg-muted">
                        {signal.evidence.slice(0, 1).join(" · ") ||
                          "No evidence"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-top text-sio-fg-subtle">
                      {signal.feedback?.label.replace("_", " ")}
                    </td>
                    <td className="min-w-0 px-4 py-2.5 align-top">
                      <label className="block min-w-0">
                        <span className="sr-only">
                          Override term for {signalTypeLabel(signal.type)}
                        </span>
                        <input
                          type="text"
                          name={`override-${signal.id}`}
                          autoComplete="off"
                          spellCheck={false}
                          value={drafts[signal.id] ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [signal.id]: e.target.value,
                            }))
                          }
                          className="input-field w-full min-w-[8rem]"
                          disabled={pending || busyId !== null}
                          placeholder="e.g. cancel my account…"
                        />
                      </label>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={pending || busyId !== null}
                          aria-busy={busyId === `${signal.id}:phrases`}
                          onClick={() =>
                            applyOverride(signal, "phrases", signal.type)
                          }
                        >
                          {busyId === `${signal.id}:phrases` ? (
                            <ButtonSpinner />
                          ) : null}
                          Add Phrase
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={pending || busyId !== null}
                          aria-busy={
                            busyId === `${signal.id}:negativePhrases`
                          }
                          onClick={() =>
                            applyOverride(
                              signal,
                              "negativePhrases",
                              signal.type
                            )
                          }
                        >
                          {busyId === `${signal.id}:negativePhrases` ? (
                            <ButtonSpinner />
                          ) : null}
                          Add Negative
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-auto shrink-0 border-t border-sio-border-base px-3 py-2 sm:px-4">
            <Pager
              page={page}
              pageCount={pageCount}
              prevHref={
                page > 1
                  ? viewHref("eval", {
                      panel: "adapt",
                      adaptPage: page - 1 > 1 ? String(page - 1) : null,
                    })
                  : null
              }
              nextHref={
                page < pageCount
                  ? viewHref("eval", {
                      panel: "adapt",
                      adaptPage: String(page + 1),
                    })
                  : null
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
