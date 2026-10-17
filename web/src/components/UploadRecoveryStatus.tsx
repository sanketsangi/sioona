import Link from "next/link";
import {
  uploadRecoverySummary,
  type UploadRecoveryStatus as Status,
} from "@/lib/upload-recovery";
import { viewHref } from "@/lib/views";
export function UploadRecoveryStatus({
  result,
  file,
}: {
  result: Status;
  file: string;
}) {
  const summary = uploadRecoverySummary(result);
  const number = (n: number) => Intl.NumberFormat().format(n);
  return (
    <section
      aria-label="Upload recovery status"
      className="panel space-y-2 p-4"
    >
      <h2 className="text-heading-18">Upload recovery</h2>
      <p role="status" aria-live="polite" className="tabular-nums">
        {number(result.completed_conversations)} of{" "}
        {number(result.conversation_count)} conversations persisted ·{" "}
        {number(summary.remaining)} not yet published
      </p>
      <p className="tabular-nums">
        Persisted signals:{" "}
        {summary.signals === null
          ? "Unavailable until the server reports a completed count"
          : number(summary.signals)}
      </p>
      {result.status === "failed" ? (
        <p>
          Partial processing failure.{" "}
          {summary.retryable
            ? `${number(summary.remaining)} unpublished conversations remain eligible for server retry.`
            : "Retry eligibility is unavailable or exhausted; ask an operator to inspect this job."}{" "}
          No new job is submitted by this screen.
        </p>
      ) : null}
      {result.attempt_count !== undefined ? (
        <p className="tabular-nums">
          Attempts: {number(result.attempt_count)}
          {result.max_attempts ? ` of ${number(result.max_attempts)}` : ""}
        </p>
      ) : null}
      {summary.terminal && result.status !== "succeeded" ? (
        <p>
          Job stopped (
          {result.status === "cancelled" ? "cancelled" : "retry limit reached"}
          ). Completed items remain persisted. Do not re-upload the whole file
          to retry partially completed work; an operator must inspect the
          existing job.
        </p>
      ) : null}
      <p className="text-sm">
        Individual failed conversation IDs are not exposed by the job API.
        Remaining items are unpublished, not necessarily failed.
      </p>
      <Link
        href={viewHref("insights", { file })}
        className="inline-flex min-h-11 items-center underline"
      >
        Inspect persisted results
      </Link>
    </section>
  );
}
