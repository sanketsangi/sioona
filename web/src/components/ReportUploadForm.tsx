import type { ReportUploadOption } from "@/lib/report-upload-options";

/** Separate GET form changes corpus without carrying an unrelated filename filter. */
export function ReportUploadForm({ query, options, unavailable }: {
  query: string; options: ReportUploadOption[]; unavailable: boolean;
}) {
  const params = new URLSearchParams(query);
  const selected = params.get("uploadId") ?? "";
  const selectedMissing = Boolean(selected && !options.some((row) => row.id === selected));
  return (
    <form action="/" method="get" aria-label="Report upload selection" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="view" value="report" />
      {["scoreFrom", "scoreTo", "reveal"].map((key) => params.has(key)
        ? <input key={key} type="hidden" name={key} value={params.get(key)!} /> : null)}
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-copy-14">
        Upload corpus
        <select name="uploadId" defaultValue={selected} aria-describedby="report-upload-help"
          className="min-h-11 w-full min-w-0 touch-manipulation rounded-md border border-sio-border-base bg-sio-bg-base px-3 text-base text-sio-fg-base tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2">
          <option value="">All current conversations</option>
          {selectedMissing ? <option value={selected}>Selected upload (not in active list)</option> : null}
          {options.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
      </label>
      <button type="submit" className="btn-secondary min-h-11 touch-manipulation">Apply upload</button>
      <p id="report-upload-help" aria-live="polite" className="w-full text-copy-14 text-sio-fg-subtle">
        {unavailable ? "Upload list unavailable. Reload this page to retry. " : options.length === 0 ? "No active uploads available. " : ""}
        Changing the upload replaces the filename filter and keeps the date range.
      </p>
    </form>
  );
}
