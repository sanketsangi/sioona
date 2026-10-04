/** Native GET form keeps report scope shareable and works before hydration. */
export function ReportRangeForm({ query, error, errorField = "scoreTo" }: { query: string; error?: string; errorField?: "scoreFrom" | "scoreTo" }) {
  const startError = Boolean(error && errorField === "scoreFrom");
  const endError = Boolean(error && errorField === "scoreTo");
  const params = new URLSearchParams(query);
  const dateValue = (name: string) => {
    const value = params.get(name) ?? "";
    return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  };
  const inputClass = "min-h-11 w-full touch-manipulation rounded-md border border-sio-border-base bg-sio-bg-base px-3 text-base text-sio-fg-base focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <form action="/" method="get" aria-label="Report date range" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="view" value="report" />
      {params.get("uploadId") ? <input type="hidden" name="uploadId" value={params.get("uploadId")!} /> : null}
      {params.get("file") ? <input type="hidden" name="file" value={params.get("file")!} /> : null}
      {params.get("reveal") === "1" ? <input type="hidden" name="reveal" value="1" /> : null}
      <label className="flex min-w-0 flex-col gap-1 text-copy-14 text-sio-fg-subtle">
        From (UTC)
        <input type="date" name="scoreFrom" aria-invalid={startError || undefined} aria-describedby={startError ? "report-start-error" : undefined} autoFocus={startError} defaultValue={dateValue("scoreFrom")} className={inputClass} />
        {startError ? <span id="report-start-error" aria-live="polite" className="max-w-xs text-copy-14 text-sio-fg-base">{error}. Choose a valid start date.</span> : null}
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-copy-14 text-sio-fg-subtle">
        Through (UTC, optional)
        <input type="date" name="scoreTo" aria-invalid={endError || undefined} aria-describedby={endError ? "report-end-error" : undefined} autoFocus={endError} defaultValue={dateValue("scoreTo")} className={inputClass} />
        {endError ? <span id="report-end-error" aria-live="polite" className="max-w-xs text-copy-14 text-sio-fg-base">{error}. Choose an end date on or after the start.</span> : null}
      </label>
      <button type="submit" className="btn-secondary min-h-11 touch-manipulation">Apply dates</button>
    </form>
  );
}
