import { viewHref, type PlatformView } from "./views";
const SCOPE = ["uploadId", "file", "scoreFrom", "scoreTo"];
export function reportScopeHref(
  view: PlatformView,
  query: URLSearchParams,
  extra: Record<string, string | null | undefined> = {},
) {
  return viewHref(view, {
    ...Object.fromEntries(SCOPE.map((key) => [key, query.get(key)])),
    ...extra,
  });
}
const synthetic = new Set([
  "testing.json",
  "zerodha_batch_02.json",
  "kuber_week_1_batch_1.csv",
  "kuber_week_1_intercom.json",
  "kuber_week_1_whatsapp.txt",
  "rehearsal_week_1.csv",
]);
export function simulationLabel(files: string[]): string {
  const unique = [...new Set(files.filter(Boolean))];
  const count = unique.filter((file) => synthetic.has(file)).length;
  if (count && count === unique.length)
    return "Simulated data and outcomes — sample filename; verify fixture provenance. Not customer impact.";
  if (count)
    return "Mixed corpus — includes simulated data; customer impact unverified.";
  return "Data provenance unverified — recorded outcomes are not proof of customer impact.";
}
export function pilotWorkflow(input: {
  conversations: number;
  reviewed: number | null;
  outcomes: number;
  pdf: boolean;
}) {
  return [
    {
      id: "upload",
      label: "Upload",
      complete: input.conversations > 0,
      detail: `${input.conversations} persisted conversations`,
    },
    {
      id: "review",
      label: "Evidence review",
      complete: input.reviewed !== null && input.reviewed > 0,
      detail:
        input.reviewed === null
          ? "Persisted review totals unavailable"
          : `${input.reviewed} persisted reviews; verify the source evidence during review`,
    },
    {
      id: "outcomes",
      label: "Outcomes",
      complete: input.outcomes > 0,
      detail: `${input.outcomes} recorded outcomes; simulated on synthetic data`,
    },
    {
      id: "pdf",
      label: "Executive PDF",
      complete: input.pdf,
      detail: input.pdf
        ? "PDF prepared on this browser; file save not verified"
        : "Prepare the scoped report PDF",
    },
  ];
}

/** Render a quote only if it reconstructs from this upload's persisted source. */
export function snapshotQuotes(
  signal: import("./types").Signal,
  messages: import("./types").Message[],
): string[] {
  if (signal.evidenceStatus !== "valid") return [];
  return (signal.evidenceSpans ?? []).flatMap((span) => {
    const message = messages.find(
      (message) =>
        message.id === span.messageId &&
        message.conversationId === signal.conversationId,
    );
    if (
      !message ||
      !Number.isInteger(span.start) ||
      !Number.isInteger(span.end) ||
      span.start < 0 ||
      span.end <= span.start
    )
      return [];
    const points = Array.from(message.content);
    if (span.end > points.length) return [];
    const quote = points.slice(span.start, span.end).join("");
    return quote && quote === span.quote ? [quote] : [];
  });
}
