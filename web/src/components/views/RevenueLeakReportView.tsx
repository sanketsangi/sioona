import Link from "next/link";
import { RevenueLeakOutcomeButtons } from "@/components/RevenueLeakOutcomeButtons";
import { ViewFrame } from "@/components/ViewFrame";
import type { BackendSignalScore } from "@/lib/backend-client";
import {
  buildRevenueLeakReport,
  formatInr,
  precisionLabel,
  type RevenueLeakReport,
} from "@/lib/revenue-leak";
import type { StoreData } from "@/lib/types";
import { viewHref } from "@/lib/views";

export async function RevenueLeakReportView({
  store,
  backendScore,
  windowLabel,
  anonymised,
}: {
  store: StoreData;
  backendScore: BackendSignalScore | null;
  windowLabel: string;
  anonymised: boolean;
}) {
  const report = buildRevenueLeakReport({
    signals: store.signals ?? [],
    conversations: store.conversations ?? [],
    messages: store.messages ?? [],
    windowLabel,
    fileLabel: store.pilot?.lastUploadedFileName ?? null,
    anonymised,
    reviewed: backendScore?.reviewed_count ?? 0,
    correct: backendScore?.correct_count ?? 0,
  });

  return (
    <ViewFrame className="overflow-y-auto">
      <ReportDocument report={report} anonymised={anonymised} />
    </ViewFrame>
  );
}

function ReportDocument({
  report,
  anonymised,
}: {
  report: RevenueLeakReport;
  anonymised: boolean;
}) {
  const pdfHref = anonymised
    ? "/api/revenue-report/pdf"
    : "/api/revenue-report/pdf?reveal=1";
  const nameToggle = anonymised
    ? viewHref("report", { reveal: "1" })
    : viewHref("report");

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-1 pb-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-heading-20 text-sio-fg-base">Revenue leak</h2>
          <p className="mt-1 text-copy-14 text-sio-fg-subtle">
            {report.windowLabel}
            {report.fileLabel ? ` · ${report.fileLabel}` : ""}
            {". "}
            {report.anonymised
              ? "Customer ids are pseudonyms."
              : "Names are visible on this page."}{" "}
            Nothing is sent to a customer.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={nameToggle} className="btn-secondary">
            {anonymised ? "Show names" : "Anonymise"}
          </Link>
          <a href={pdfHref} className="btn-primary">
            Download PDF
          </a>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Totals">
        <Metric label="Retention" value={String(report.counts.retention)} />
        <Metric label="Lead" value={String(report.counts.lead)} />
        <Metric label="Upsell" value={String(report.counts.upsell)} />
        <Metric
          label="Precision"
          value={precisionLabel(report.precision.score, report.precision.reviewed)}
        />
        <Metric label="At risk" value={formatInr(report.inrAtRisk)} />
        <Metric label="Saved" value={formatInr(report.inrSaved)} />
        <Metric
          label="Outcomes"
          value={`${report.outcomes.saved} saved · ${report.outcomes.lost} lost · ${report.outcomes.converted} converted`}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-label-14 text-sio-fg-base">Customers at risk</h3>
        {report.customersAtRisk.length === 0 ? (
          <div className="panel px-4 py-6">
            <p className="text-copy-14 text-sio-fg-base">
              No retention signals in this pilot file.
            </p>
            <Link href={viewHref("upload")} className="link-accent mt-2 inline-flex">
              Upload chats
            </Link>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {report.customersAtRisk.map((row) => (
              <li key={row.signalId} className="panel px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-label-14 text-sio-fg-base" translate="no">
                    {row.customerLabel}
                  </p>
                  <p className="text-copy-14 tabular text-sio-fg-subtle">
                    {row.urgency}
                    {row.timeframe ? ` · ${row.timeframe}` : ""}
                    {" · "}
                    {row.valueInr == null ? "Value not stated" : formatInr(row.valueInr)}
                  </p>
                </div>
                <blockquote className="mt-2 border-l border-sio-border-base pl-3 text-copy-14 text-pretty text-sio-fg-base">
                  “{row.quote}”
                </blockquote>
                <div className="mt-3">
                  <RevenueLeakOutcomeButtons
                    signalId={row.signalId}
                    backendSignalId={row.backendSignalId}
                    valueInr={row.valueInr}
                    current={row.outcome}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-3 py-3">
      <p className="text-label-12 text-sio-fg-subtle">{label}</p>
      <p className="mt-1 text-copy-14 tabular text-sio-fg-base">{value}</p>
    </div>
  );
}
