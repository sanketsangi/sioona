"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { Pager } from "@/components/Pager";
import { signalTypeLabel } from "@/lib/format";
import { parsePage, viewHref } from "@/lib/views";
import type { Signal, SignalType, TaxonomyOverrides } from "@/lib/types";

type OverrideField = "phrases" | "negativePhrases";

const PAGE_SIZE = 5;

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
  const [focusTermId, setFocusTermId] = useState<string | null>(null);
  const termRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const signal of signals) {
      initial[signal.id] = suggestTerm(signal);
    }
    return initial;
  });

  const reviewSignals = signals.filter(
    (s) =>
      s.feedback?.label === "reject" || s.feedback?.label === "wrong_reason"
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

  useEffect(() => {
    if (!focusTermId) return;
    termRefs.current[focusTermId]?.focus();
    setFocusTermId(null);
  }, [focusTermId]);

  const pageCount = Math.max(1, Math.ceil(reviewSignals.length / PAGE_SIZE));
  const page = Math.min(parsePage(adaptPageRaw), pageCount);
  const pageItems = reviewSignals.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  async function applyOverride(
    signal: Signal,
    field: OverrideField,
    type: SignalType
  ) {
    const value = (drafts[signal.id] ?? "").trim();
    if (!value) {
      setError("Enter a phrase or negative term first.");
      setFocusTermId(signal.id);
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
    <div className={`panel overflow-hidden ${compact ? "" : "mt-6"}`}>
      <div className="border-b border-ds-gray-400 px-4 py-3">
        <h2 className="text-balance text-heading-16 text-ds-gray-1000">
          Adapt From Reviews
        </h2>
        <p className="mt-1 max-w-2xl text-pretty text-label-13 text-ds-gray-900">
          Reject → Add Negative (stop false positives). Wrong reason / miss →
          Add Phrase. Each change re-detects immediately.
        </p>
      </div>

      <div aria-live="polite">
        {success ? (
          <p className="border-b border-ds-gray-400 bg-ds-green-100 px-4 py-2.5 text-pretty text-copy-14 text-ds-green-900">
            {success}
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          className="border-b border-ds-gray-400 bg-ds-red-100 px-4 py-2.5 text-pretty text-copy-14 text-ds-red-900"
          role="alert"
        >
          {error} Fix the term and try again.
        </p>
      ) : null}

      {overrideRows.length > 0 ? (
        <div className="border-b border-ds-gray-400 px-4 py-3">
          <h3 className="text-label-12 text-ds-gray-900">Active Overrides</h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {overrideRows.slice(0, 6).map((row) => (
              <li
                key={`${row.type}-${row.field}-${row.value}`}
                className="max-w-full truncate rounded-sm border border-ds-gray-400 bg-ds-gray-100 px-2 py-1 text-label-12 text-ds-gray-1000"
              >
                {signalTypeLabel(row.type)} · {row.field}: “{row.value}”
              </li>
            ))}
            {overrideRows.length > 6 ? (
              <li className="self-center text-label-13 text-ds-gray-900">
                +{overrideRows.length - 6} more
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {reviewSignals.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <p className="text-heading-16 text-ds-gray-1000">
            No reviews to adapt from
          </p>
          <p className="mt-1 max-w-sm text-pretty text-copy-14 text-ds-gray-900">
            Reject a signal or mark it as the wrong reason, then return here to
            tune detection.
          </p>
          <Link href={viewHref("insights")} className="btn-primary mt-4">
            Review Signals
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-ds-gray-400">
            {pageItems.map((signal) => {
              const termId = `override-term-${signal.id}`;
              return (
                <li
                  key={signal.id}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-6"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={viewHref("insights", { signal: signal.id })}
                        className="link-accent"
                      >
                        {signalTypeLabel(signal.type)}
                      </Link>
                      <span className="text-label-12 capitalize text-ds-gray-900">
                        · {signal.feedback?.label.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-pretty text-label-13 text-ds-gray-900">
                      {signal.evidence.slice(0, 1).join(" · ") ||
                        "No evidence"}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <label
                      htmlFor={termId}
                      className="block text-label-12 text-ds-gray-900"
                    >
                      Override term for {signalTypeLabel(signal.type)}
                    </label>
                    <input
                      ref={(el) => {
                        termRefs.current[signal.id] = el;
                      }}
                      id={termId}
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
                      className="input-field mt-1"
                      disabled={pending || busyId !== null}
                      placeholder="e.g. cancel my account…"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
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
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-ds-gray-400 px-4 py-3">
            <Pager
              page={page}
              pageCount={pageCount}
              label="Reviews"
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
