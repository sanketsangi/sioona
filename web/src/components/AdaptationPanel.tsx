"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { EvalCard } from "@/components/EvalCard";
import { Pager } from "@/components/Pager";
import { signalTypeLabel } from "@/lib/format";
import { parsePage, viewHref } from "@/lib/views";
import type {
  FeedbackLabel,
  Signal,
  SignalType,
  TaxonomyOverrides,
} from "@/lib/types";

export type OverrideField = "phrases" | "negativePhrases";

const ADAPT_APPLY_ACTIONS: {
  field: OverrideField;
  label: "Add Phrase" | "Add Negative";
}[] = [
  { field: "phrases", label: "Add Phrase" },
  { field: "negativePhrases", label: "Add Negative" },
];

/** Incorrect → negative (false positive). Partial → phrase. Same draft either way. */
export function primaryOverrideField(
  label: Extract<FeedbackLabel, "incorrect" | "partially_correct">,
): OverrideField {
  return label === "incorrect" ? "negativePhrases" : "phrases";
}

export function adaptApplyActions(
  label: Extract<FeedbackLabel, "incorrect" | "partially_correct">,
): {
  field: OverrideField;
  label: "Add Phrase" | "Add Negative";
  primary: boolean;
}[] {
  const primary = primaryOverrideField(label);
  return ADAPT_APPLY_ACTIONS.map((action) => ({
    ...action,
    primary: action.field === primary,
  }));
}

export function taxonomyOverrideBody(input: {
  type: SignalType;
  field: OverrideField;
  value: string;
}) {
  return {
    action: "add_taxonomy_override" as const,
    type: input.type,
    field: input.field,
    value: input.value,
    redetect: true as const,
  };
}

const PAGE_SIZE = 2;

/** Whole short notes may fill the draft. Longer notes are never sliced in. */
const SHORT_NOTE_MAX = 80;

function capturedTerm(item: string): string | null {
  const captured = item.match(/"([^"]+)"/);
  const term = captured?.[1]?.trim() ?? "";
  return term || null;
}

/** A term, not a sentence. Full sentences stay beside the field. */
function isShortAdaptNote(note: string): boolean {
  return note.length > 0 && note.length <= SHORT_NOTE_MAX && !/[.!?]/.test(note);
}

/**
 * Override draft: matched phrase or keyword, else a short note, else a
 * clipped quote. A sentence or long feedback note is never sliced in.
 */
export function suggestTerm(signal: Signal): string {
  const match = signal.evidence.find(
    (e) => e.startsWith("phrase: ") || e.startsWith("keyword: ")
  );
  if (match) {
    const term = capturedTerm(match);
    if (term) return term;
  }
  const note = signal.feedback?.note?.trim() ?? "";
  if (isShortAdaptNote(note)) return note;
  const quote = signal.evidence.find((e) => e.startsWith("quote: "));
  if (quote) {
    const term = capturedTerm(quote);
    if (term) return term.slice(0, SHORT_NOTE_MAX);
  }
  return "";
}

function OverrideTermControl({
  signal,
  value,
  disabled,
  noteDomId,
  inputClassName,
  onValueChange,
}: {
  signal: Signal;
  value: string;
  disabled: boolean;
  noteDomId: string;
  inputClassName: string;
  onValueChange: (value: string) => void;
}) {
  const note = signal.feedback?.note?.trim() ?? "";
  return (
    <div className="min-w-0">
      <label className="block min-w-0">
        <span className="sr-only">
          Override term for {signalTypeLabel(signal.type)}
        </span>
        <input
          type="text"
          name={`override-${signal.id}`}
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-describedby={note ? noteDomId : undefined}
          onChange={(e) => onValueChange(e.target.value)}
          className={inputClassName}
          disabled={disabled}
          placeholder="e.g. cancel my account…"
        />
      </label>
      {note ? (
        <p
          id={noteDomId}
          className="mt-1 line-clamp-3 break-words text-pretty text-label-13 text-sio-fg-muted"
        >
          <span className="sr-only">Saved note: </span>
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function AdaptationPanel({
  signals,
  taxonomyOverrides,
  compact = false,
  adaptPageRaw,
  hideSampleAdapt = false,
}: {
  signals: Signal[];
  taxonomyOverrides: TaxonomyOverrides;
  compact?: boolean;
  adaptPageRaw?: string | null;
  /** Real partner exports must not one-click a sample Adapt pack. */
  hideSampleAdapt?: boolean;
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
        body: JSON.stringify(
          taxonomyOverrideBody({ type, field, value }),
        ),
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
    <EvalCard
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${compact ? "" : "mt-6"}`}
    >
      <div className="shrink-0 border-b border-sio-border-base px-3 py-2.5 sm:px-4">
        <h2 className="text-balance text-heading-16 text-sio-fg-base">
          Adapt From Reviews
        </h2>
        <p className="mt-1 text-label-13 text-sio-fg-muted">
          Reject → Add Negative (stop false positives). Wrong reason / miss →
          Add Phrase. Each change re-detects immediately.
        </p>
        {hideSampleAdapt ? null : (
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
        )}
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
        <p className="px-3 py-4 text-copy-14 text-sio-fg-subtle sm:px-4">
          No incorrect or partially_correct feedback yet. Review signals in{" "}
          <Link href={viewHref("insights")} className="link-accent">
            Insights
          </Link>
          , then return here to tune detection.
        </p>
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
                  <div className="mt-2.5">
                    <OverrideTermControl
                      signal={signal}
                      value={drafts[signal.id] ?? ""}
                      disabled={pending || busyId !== null}
                      noteDomId={`override-note-${signal.id}-card`}
                      inputClassName="input-field w-full"
                      onValueChange={(next) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [signal.id]: next,
                        }))
                      }
                    />
                  </div>
                  <AdaptApplyButtons
                    signal={signal}
                    className="mt-2"
                    disabled={pending || busyId !== null}
                    busyId={busyId}
                    onApply={applyOverride}
                  />
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
                      <OverrideTermControl
                        signal={signal}
                        value={drafts[signal.id] ?? ""}
                        disabled={pending || busyId !== null}
                        noteDomId={`override-note-${signal.id}-table`}
                        inputClassName="input-field w-full min-w-[8rem]"
                        onValueChange={(next) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [signal.id]: next,
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <AdaptApplyButtons
                        signal={signal}
                        disabled={pending || busyId !== null}
                        busyId={busyId}
                        onApply={applyOverride}
                      />
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
    </EvalCard>
  );
}

function AdaptApplyButtons({
  signal,
  className = "",
  disabled,
  busyId,
  onApply,
}: {
  signal: Signal;
  className?: string;
  disabled: boolean;
  busyId: string | null;
  onApply: (signal: Signal, field: OverrideField, type: SignalType) => void;
}) {
  const label = signal.feedback?.label;
  const actions = adaptApplyActions(
    label === "incorrect" ? "incorrect" : "partially_correct",
  );

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`.trim()}>
      {actions.map((action) => {
        const busy = busyId === `${signal.id}:${action.field}`;
        return (
          <button
            key={action.field}
            type="button"
            className={action.primary ? "btn-primary" : "btn-secondary"}
            disabled={disabled}
            aria-busy={busy}
            onClick={() => onApply(signal, action.field, signal.type)}
          >
            {busy ? <ButtonSpinner /> : null}
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
