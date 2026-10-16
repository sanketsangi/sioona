import Link from "next/link";
import { ReportUploadForm } from "@/components/ReportUploadForm";
import { reportUploadOptions, type ReportUploadOption } from "@/lib/report-upload-options";
import { ReportRangeForm } from "@/components/ReportRangeForm";
import { queryRevenueReport } from "@/lib/revenue-report-query";
import { RevenueLeakOutcomeButtons } from "@/components/RevenueLeakOutcomeButtons";
import { ViewFrame } from "@/components/ViewFrame";
import type { BackendSignalScore } from "@/lib/backend-client";
import {
  formatInr,
  precisionLabel,
  type RevenueLeakReport,
} from "@/lib/revenue-leak";
import type { StoreData } from "@/lib/types";
import { viewHref } from "@/lib/views";

export async function RevenueLeakReportView({
  store,
  anonymised,
  scoreFrom,
  scoreTo,
  uploadId,
  file,
}: {
  store: StoreData;
  backendScore: BackendSignalScore | null;
  windowLabel: string;
  anonymised: boolean;
  scoreFrom?: string;
  scoreTo?: string;
  uploadId?: string;
  file?: string;
}) {
  const { report, query, rangeError, rangeErrorField, scopeError } = await queryRevenueReport(store, { scoreFrom, scoreTo, uploadId, file, reveal: !anonymised });

  let uploadOptions: ReportUploadOption[] = [];
  let uploadsUnavailable = false;
  try { uploadOptions = await reportUploadOptions(store.tenant.id); }
  catch { uploadsUnavailable = true; }

  return (
    <ViewFrame className="overflow-y-auto">
      <ReportDocument report={report} anonymised={anonymised} query={query.toString()} rangeError={rangeError} rangeErrorField={rangeErrorField} scopeError={scopeError} uploadOptions={uploadOptions} uploadsUnavailable={uploadsUnavailable} />
    </ViewFrame>
  );
}

function ReportDocument({
  report,
  anonymised,
  query,
  rangeError,
  rangeErrorField,
  scopeError,
  uploadOptions,
  uploadsUnavailable,
}: {
  report: RevenueLeakReport;
  anonymised: boolean;
  query: string;
  rangeError?: string;
  rangeErrorField?: "scoreFrom" | "scoreTo";
  scopeError?: string;
  uploadOptions: ReportUploadOption[];
  uploadsUnavailable: boolean;
}) {
  const pdfHref = `/api/revenue-report/pdf?${query}`;
  const toggleParams = new URLSearchParams(query);
  if (anonymised) toggleParams.set("reveal", "1");
  else toggleParams.delete("reveal");
  toggleParams.set("view", "report");
  const nameToggle = `/?${toggleParams}`;

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-1 pb-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-heading-20 text-sio-fg-base">Revenue report</h2>
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
          {!scopeError && !rangeError ? <a href={pdfHref} className="btn-primary">
            Download PDF
          </a> : <span className="text-copy-14 text-sio-fg-subtle self-center">PDF unavailable until report errors are resolved</span>}
        </div>
      </header>

      {scopeError ? <p role="status" className="text-copy-14 text-sio-fg-base">{scopeError} <Link href="/?view=report" className="underline">Open current report</Link>{" · "}<Link href="/upload" className="underline">Open uploads</Link></p> : null}
      <ReportUploadForm query={query} options={uploadOptions} unavailable={uploadsUnavailable} />
      <ReportRangeForm query={query} error={rangeError} errorField={rangeErrorField} />

      <p className="text-copy-14 text-sio-fg-subtle">Exposure categories cover retention conversations and are estimates, not confirmed revenue. Signal counts cover the selected corpus. Reviews and recorded outcomes use the UTC date range.</p>

      <section className="space-y-3" aria-labelledby="review-coverage">
        <h3 id="review-coverage" className="text-heading-18 text-sio-fg-base">Review coverage</h3>
        <p className="text-copy-14 text-sio-fg-subtle">Precision uses Correct reviews divided by all reviews, including Partially correct. Counts cover the selected corpus; reviews use the UTC window.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Retention" value={String(report.counts.retention)} />
        <Metric label="Lead" value={String(report.counts.lead)} />
        <Metric label="Upsell" value={String(report.counts.upsell)} />
        <Metric
          label="Precision"
          value={precisionLabel(report.precision.score, report.precision.reviewed)}
        />
        </div>
      </section>
      <section className="space-y-3" aria-labelledby="estimated-opportunity">
        <h3 id="estimated-opportunity" className="text-heading-18 text-sio-fg-base">Estimated opportunity</h3>
        <p className="text-copy-14 text-sio-fg-subtle">Exposure and opportunity are estimates from stated values. They are not confirmed revenue and are not combined into a conversion forecast.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Asset exposure estimate" value={formatInr(report.exposure.assetInr)} />
        <Metric label="Revenue opportunity estimate" value={formatInr(report.exposure.revenueOpportunityInr)} />
        <Metric label="Unconfirmed value" value={formatInr(report.exposure.unconfirmedInr)} />
        </div>
      </section>
      <section className="space-y-3" aria-labelledby="recorded-outcomes">
        <h3 id="recorded-outcomes" className="text-heading-18 text-sio-fg-base">Recorded outcomes</h3>
        <p className="text-copy-14 text-sio-fg-subtle">Reviewer-recorded values are separate from verified saved value. Unavailable verification is not zero. Outcomes record operator judgments; Sioona sends nothing.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Reviewer-recorded value" value={formatInr(report.exposure.reviewerRecordedInr)} />
        <Metric label="Verified saved value" value={report.revenueVerified === false ? "Unavailable" : formatInr(report.inrSaved)} />
        <Metric
          label="Outcomes"
          value={`${report.outcomes.saved} saved · ${report.outcomes.lost} lost · ${report.outcomes.converted} converted`}
        />
        </div>
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
                    {row.valueProvenance ? ` · ${row.valueProvenance}` : ""}
                  </p>
                </div>
                {row.quote ? <blockquote className="mt-2 border-l border-sio-border-base pl-3 text-copy-14 text-pretty text-sio-fg-base">
                  “{row.quote}”
                </blockquote> : <p className="mt-2 text-copy-14 text-sio-fg-subtle">Customer quote unavailable</p>}
                {!row.historical ? <Link href={viewHref("insights", { preview: row.signalId, file: report.fileLabel, scoreFrom: new URLSearchParams(query).get("scoreFrom") })} className="link-accent mt-2 inline-flex min-h-11 items-center">Inspect signal and evidence</Link> : null}
                <div className="mt-3">
                  {row.historical ? <p className="text-copy-14 text-sio-fg-subtle">
                    Historical prediction · outcome editing unavailable. <Link href="/?view=report" className="underline focus-visible:outline-2 focus-visible:outline-offset-2">Open current report</Link>
                  </p> : <RevenueLeakOutcomeButtons
                    signalId={row.signalId}
                    backendSignalId={row.backendSignalId}
                    valueInr={row.valueInr}
                    current={row.outcome}
                  />}
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
