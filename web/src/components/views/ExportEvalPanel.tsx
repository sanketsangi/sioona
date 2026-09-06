"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  EvalCard,
  evalCardHeaderClassName,
  evalMetricCellClassName,
} from "@/components/EvalCard";
import { Note, NoteContent } from "@/components/ui/Note";
import { formatPercent, signalTypeLabel } from "@/lib/format";
import { viewHref } from "@/lib/views";
import type { EvalMetrics } from "@/lib/eval";
import type { PartnerExportEvalApiResponse } from "@/lib/partner-export-eval-api";
import type { ConfusionExample } from "@/lib/testing-json-eval";

function MetricBlock({
  title,
  metrics,
}: {
  title: string;
  metrics: EvalMetrics;
}) {
  return (
    <EvalCard className="min-w-0">
      <div className={evalCardHeaderClassName}>
        <p className="eyebrow">{title}</p>
      </div>
      <div className="grid min-w-0 grid-cols-3 divide-x divide-sio-border-base overflow-hidden">
        <div className={evalMetricCellClassName}>
          <div className="metric-label">P</div>
          <div className="tabular mt-0.5 text-heading-16 text-sio-fg-base">
            {formatPercent(metrics.labeledPrecision)}
          </div>
          <div className="mt-0.5 line-clamp-2 text-pretty text-label-12 text-sio-fg-muted">
            {metrics.truePositives} TP / {metrics.falsePositives} FP
          </div>
        </div>
        <div className={evalMetricCellClassName}>
          <div className="metric-label">R</div>
          <div className="tabular mt-0.5 text-heading-16 text-sio-fg-base">
            {formatPercent(metrics.labeledRecall)}
          </div>
          <div className="mt-0.5 line-clamp-2 text-pretty text-label-12 text-sio-fg-muted">
            {metrics.falseNegatives} FN
          </div>
        </div>
        <div className={evalMetricCellClassName}>
          <div className="metric-label">Labeled</div>
          <div className="tabular mt-0.5 text-heading-16 text-sio-fg-base">
            {metrics.labeledConversations}
          </div>
          <div className="mt-0.5 line-clamp-2 text-pretty text-label-12 text-sio-fg-muted">
            {metrics.predictedSignals} pred.
          </div>
        </div>
      </div>
    </EvalCard>
  );
}

function ByTypeTable({ metrics }: { metrics: EvalMetrics }) {
  return (
    <div className="hide-scrollbar min-h-0 min-w-0 overflow-x-auto">
      <table className="w-full min-w-0 text-left text-copy-14">
        <caption className="sr-only">
          Per-type labeled precision and recall for this export eval pass.
        </caption>
        <thead className="border-b border-sio-border-base">
          <tr>
            <th
              scope="col"
              className="px-3 py-2 text-label-12 font-medium text-sio-fg-subtle sm:px-4"
            >
              Type
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-label-12 font-medium text-sio-fg-subtle sm:px-4"
            >
              Labeled
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-label-12 font-medium text-sio-fg-subtle sm:px-4"
            >
              Precision
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-label-12 font-medium text-sio-fg-subtle sm:px-4"
            >
              Recall
            </th>
            <th
              scope="col"
              className="hidden px-3 py-2 text-label-12 font-medium text-sio-fg-subtle sm:table-cell sm:px-4"
            >
              TP / FP / FN
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sio-border-base">
          {metrics.byType.map((row) => (
            <tr key={row.type}>
              <th
                scope="row"
                className="whitespace-nowrap px-3 py-2.5 text-left text-copy-14 font-normal text-sio-fg-base sm:px-4"
              >
                {signalTypeLabel(row.type)}
              </th>
              <td className="tabular px-3 py-2.5 font-mono text-label-13 text-sio-fg-subtle sm:px-4">
                {row.labeledCount}
              </td>
              <td className="tabular px-3 py-2.5 text-sio-fg-base sm:px-4">
                {formatPercent(row.precision)}
              </td>
              <td className="tabular px-3 py-2.5 text-sio-fg-base sm:px-4">
                {formatPercent(row.recall)}
              </td>
              <td className="hidden tabular whitespace-nowrap px-3 py-2.5 font-mono text-label-13 text-sio-fg-subtle sm:table-cell sm:px-4">
                {row.truePositives} / {row.falsePositives} /{" "}
                {row.falseNegatives}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfusionList({
  title,
  examples,
}: {
  title: string;
  examples: ConfusionExample[];
}) {
  if (examples.length === 0) {
    return (
      <p className="px-3 py-2.5 text-copy-14 text-sio-fg-muted sm:px-4">
        No FP/FN in this pass.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-sio-border-base">
      <li className="sr-only">{title}</li>
      {examples.map((ex) => (
        <li key={`${ex.kind}-${ex.externalId}`} className="px-3 py-2.5 sm:px-4">
          <p className="truncate font-mono text-label-13 text-sio-fg-base">
            <span className="text-sio-fg-muted">[{ex.kind}]</span>{" "}
            {ex.externalId}
          </p>
          <p className="mt-0.5 text-pretty text-label-12 text-sio-fg-subtle">
            expected={ex.expected} predicted=[
            {ex.predicted.length > 0 ? ex.predicted.join(", ") : "—"}]
          </p>
          {ex.snippet ? (
            <p className="mt-1 line-clamp-2 text-pretty text-label-12 text-sio-fg-muted">
              {ex.snippet}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export const EXPORT_EVAL_EMPTY_TITLE = "Week-2 export isn’t ready yet";
export const EXPORT_EVAL_EMPTY_BODY =
  "Upload a labeled partner export to unlock this measurement. Nothing is sent — this view is measurement only, not SignalScore.";

export function ExportEvalEmptyState({
  error,
}: {
  error?: (PartnerExportEvalApiResponse & { ok: false }) | null;
}) {
  const showTechnical =
    process.env.NODE_ENV === "development" && Boolean(error?.debugMessage);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <Note>
        <NoteContent>
          <p className="text-balance text-heading-16 text-sio-fg-base">
            {EXPORT_EVAL_EMPTY_TITLE}
          </p>
          <p className="mt-1 text-pretty text-copy-14 text-sio-fg-subtle">
            {EXPORT_EVAL_EMPTY_BODY}
          </p>
          {showTechnical ? (
            <details className="mt-3 text-label-12 text-sio-fg-muted">
              <summary className="cursor-pointer text-sio-fg-subtle hover:text-sio-fg-base">
                Technical details
              </summary>
              <p className="mt-1.5 break-words font-mono text-label-12 text-sio-fg-muted">
                {error?.debugMessage}
              </p>
            </details>
          ) : null}
        </NoteContent>
      </Note>
      <div className="flex flex-wrap gap-2">
        <Link href={viewHref("upload")} className="btn-primary">
          Upload export
        </Link>
        <Link
          href={viewHref("eval", { panel: "metrics" })}
          className="btn-secondary"
        >
          Back to Metrics
        </Link>
      </div>
    </div>
  );
}

export function ExportEvalPanel() {
  const [data, setData] = useState<PartnerExportEvalApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/eval/partner-export?week2=1")
      .then(async (res) => {
        const json = (await res.json()) as PartnerExportEvalApiResponse;
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            ok: false,
            code: "error",
            message: "Failed to load partner-export eval.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-8">
        <p className="text-copy-14 text-sio-fg-muted">Loading export eval…</p>
      </div>
    );
  }

  if (!data || !data.ok) {
    return <ExportEvalEmptyState error={data} />;
  }

  const hybridLine =
    data.hybrid && data.llm.enabled
      ? `hybrid P ${formatPercent(data.hybrid.labeledPrecision)} / R ${formatPercent(data.hybrid.labeledRecall)}`
      : "hybrid=skipped";

  return (
    <div className="hide-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden">
      <Note>
        <NoteContent>
          <p className="text-balance text-heading-16 text-sio-fg-base">
            Export eval · {data.source}
          </p>
          <p className="mt-0.5 font-mono text-label-12 text-sio-fg-muted">
            file={data.filename} · {hybridLine}
          </p>
          <p className="mt-2 text-pretty text-label-13 text-sio-fg-subtle">
            {data.note}
          </p>
        </NoteContent>
      </Note>

      <div className="grid shrink-0 gap-4 lg:grid-cols-2">
        <MetricBlock title="Heuristic (base)" metrics={data.heuristic} />
        {data.adapted ? (
          <MetricBlock
            title="Heuristic (adapt)"
            metrics={data.adapted}
          />
        ) : (
          <EvalCard className="flex min-w-0 items-center px-3 py-4 sm:px-4">
            <p className="text-copy-14 text-sio-fg-muted">
              Adapt pass not run for this source.
            </p>
          </EvalCard>
        )}
      </div>

      <div className="grid min-h-0 shrink-0 gap-4 lg:grid-cols-2">
        <EvalCard className="flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-sio-border-base px-3 py-2.5 sm:px-4">
            <h2 className="text-balance text-heading-16 text-sio-fg-base">
              Base · By Type
            </h2>
          </div>
          <ByTypeTable metrics={data.heuristic} />
        </EvalCard>
        {data.adapted ? (
          <EvalCard className="flex min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-sio-border-base px-3 py-2.5 sm:px-4">
              <h2 className="text-balance text-heading-16 text-sio-fg-base">
                Adapt · By Type
              </h2>
            </div>
            <ByTypeTable metrics={data.adapted} />
          </EvalCard>
        ) : null}
      </div>

      <EvalCard className="flex min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-sio-border-base px-3 py-2.5 sm:px-4">
          <h2 className="text-balance text-heading-16 text-sio-fg-base">
            Confusion (base) · top {data.confusion.length}
          </h2>
        </div>
        <div className="hide-scrollbar max-h-64 min-h-0 overflow-y-auto">
          <ConfusionList title="Base confusion" examples={data.confusion} />
        </div>
      </EvalCard>
    </div>
  );
}
