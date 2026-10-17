"use client";
import Link from "next/link";
import { useEffect, useSyncExternalStore, useState } from "react";
import { pilotWorkflow, reportScopeHref } from "@/lib/pilot-workflow";
import { ButtonSpinner } from "@/components/ButtonSpinner";
const changed = "sioona-pdf-prepared";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changed, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changed, callback);
  };
}
export function PilotChecklist({
  conversations,
  reviewed,
  outcomes,
  query,
  pdfKey,
  label,
  disabled = false,
}: {
  conversations: number;
  reviewed: number | null;
  outcomes: number;
  query: string;
  pdfKey: string;
  label: string;
  disabled?: boolean;
}) {
  const storageKey = `sioona-pilot-pdf:${pdfKey}`;
  const pdf = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(storageKey) === "prepared";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const steps = pilotWorkflow({ conversations, reviewed, outcomes, pdf });
  useEffect(() => {
    // Anchor an implicit rolling window in the URL before download/reload. Retain
    // Next's history state and all unrelated navigation/filter parameters.
    if (disabled) return;
    const url = new URL(window.location.href);
    const start = new URLSearchParams(query).get("scoreFrom");
    if (!url.searchParams.has("scoreFrom") && start) {
      url.searchParams.set("scoreFrom", start);
      window.history.replaceState(window.history.state, "", url);
    }
  }, [query, disabled]);
  const params = new URLSearchParams(query);
  const links = [
    "/?view=upload",
    reportScopeHref("insights", params),
    `${reportScopeHref("report", params)}#recorded-outcomes`,
  ];
  async function download() {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/revenue-report/pdf?${query}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/pdf")
      )
        throw new Error();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sioona-revenue-leak.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (response.headers.get("X-Sioona-Report-Key") !== pdfKey) {
        setMessage(
          "PDF prepared from updated workspace data. Refresh this report before recording checklist completion.",
        );
        return;
      }
      try {
        localStorage.setItem(storageKey, "prepared");
        window.dispatchEvent(new Event(changed));
        setMessage(
          "PDF prepared. Browser receipt saved for this report scope and totals; file save is not verified.",
        );
      } catch {
        setMessage(
          "PDF prepared. Browser storage is unavailable; completion will not persist on this device.",
        );
      }
    } catch {
      setMessage(
        "PDF unavailable. Retry preparing this report; no completion was recorded.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      aria-labelledby="pilot-checklist-title"
      className="panel space-y-3 p-4 sm:p-5"
    >
      <h2 id="pilot-checklist-title" className="text-heading-18">
        Guided pilot checklist
      </h2>
      <p className="text-sm">{label}</p>
      <ol className="grid gap-4 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.id} className="min-w-0 space-y-1">
            <p className="text-label-14">
              {index + 1}. {step.label} ·{" "}
              {disabled
                ? "Unavailable"
                : step.complete
                  ? "Complete"
                  : "Next step"}
            </p>
            <p className="text-sm text-muted-foreground">{step.detail}</p>
            {index < 3 ? (
              <Link
                href={links[index]}
                className="inline-flex min-h-11 items-center underline focus-visible:outline-2"
              >
                {
                  [
                    "Open uploads",
                    "Review source evidence",
                    "Record an outcome",
                  ][index]
                }
              </Link>
            ) : (
              <button
                type="button"
                disabled={disabled || pending}
                aria-busy={pending}
                onClick={download}
                className="btn-secondary min-h-11 touch-manipulation"
              >
                {pending ? <ButtonSpinner /> : null}Prepare executive PDF
              </button>
            )}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        Upload, review and outcome states are reconstructed from stored
        workspace records for this scope. PDF preparation is remembered only in
        this browser. No step sends a customer message.
      </p>
      <p role="status" aria-live="polite" className="text-sm">
        {message}
      </p>
    </section>
  );
}
