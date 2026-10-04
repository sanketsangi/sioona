/** Shared server query for the report page and its PDF. */
import { selectUploadCorpus } from "./report-upload-corpus";
import { scopeReportEvents } from "./report-events";
import { selectReportCorpus } from "./report-corpus";
import { fetchSignalScoreSafe } from "./fetch-signal-score";
import { buildRevenueLeakReport } from "./revenue-leak";
import { inspectSignalScoreEnd, inspectSignalScoreWindow } from "./signal-score-window";
import type { StoreData } from "./types";

export async function queryRevenueReport(store: StoreData, options: {
  scoreFrom?: string | null; scoreTo?: string | null; uploadId?: string | null; file?: string | null; reveal?: boolean; now?: Date;
}) {
  const window = inspectSignalScoreWindow({ scoreFrom: options.scoreFrom,
    envFrom: process.env.SIGNAL_SCORE_FROM, now: options.now });
  const end = inspectSignalScoreEnd(options.scoreTo, window.resolvedFrom);
  const rangeError = window.status === "invalid" ? "Invalid report start date" : end.error;
  const rangeErrorField = window.status === "invalid" ? "scoreFrom" as const : "scoreTo" as const;
  const file = options.file?.trim() || null;
  const uploadId = options.uploadId?.trim() || null;
  let corpus = store;
  let scopeError: string | undefined;
  if (uploadId) {
    try { corpus = await selectUploadCorpus(store, uploadId); }
    catch { scopeError = "The selected upload’s original snapshot is unavailable. Choose another upload or open the current report.";
      corpus = { ...store, conversations: [], messages: [], signals: [] }; }
  }
  const scoped = selectReportCorpus(corpus, file);
  const conversations = scoped.conversations;
  const ids = new Set(conversations.map((chat) => chat.id));
  const signals = scopeReportEvents(scoped.signals, rangeError ? "" : window.resolvedFrom, end.dateTo);
  const score = rangeError || scopeError ? null : await fetchSignalScoreSafe(store.tenant.id, [...ids], { ...(uploadId ? { uploadId } : {}), dateFrom: window.resolvedFrom, ...(end.dateTo ? { dateTo: end.dateTo } : {}) });
  const report = buildRevenueLeakReport({ signals, conversations,
    messages: scoped.messages,
    windowLabel: rangeError ?? `${window.label}${end.dateTo ? ` to ${end.dateTo.slice(0, 10)}` : ""} · reviews and outcomes`, fileLabel: file,
    anonymised: !options.reveal, reviewed: score?.reviewed_count ?? 0,
    correct: score?.correct_count ?? 0, incorrect: score?.incorrect_count ?? 0 });
  // Outcome totals come from the same scoped and time-bounded server query.
  report.inrSaved = score?.revenue_saved_inr ?? 0;
  report.revenueVerified = score !== null;
  const params = new URLSearchParams({ scoreFrom: window.status === "invalid" ? options.scoreFrom! : window.resolvedFrom });
  if (end.dateTo) params.set("scoreTo", end.dateTo);
  else if (end.error && options.scoreTo) params.set("scoreTo", options.scoreTo);
  if (uploadId) params.set("uploadId", uploadId);
  if (file) params.set("file", file);
  if (options.reveal) params.set("reveal", "1");
  return { report, query: params, score, scopedStore: { ...scoped, signals }, scoreAvailable: score !== null, rangeError, rangeErrorField, scopeError };
}
