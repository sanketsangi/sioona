"use client";
import { useEffect, useRef, useState } from "react";

type Receipt = { id: string; state: string; checkpoint: number; steps: number; counts: Record<string, number>; reason_code: string | null; policy_version: string; completed_at: string | null; backup_expiry: string };
type Status = { policy_version: string; scheduler_enabled: boolean; holds: { id: string; reason_code: string; resource_type: string; resource_id: string | null }[]; deletion: Receipt | null; audit: { id: string; operation: string; result: string; created_at: string }[] };
const button = "min-h-11 touch-manipulation rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60";
function saveReceipt(receipt: Receipt) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "sioona-deletion-receipt.json"; link.click(); URL.revokeObjectURL(url);
}
export function LifecycleControls({ tenant }: { tenant: string }) {
  const [data, setData] = useState<Status | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [exportId, setExportId] = useState<string | null>(null);
  const [reason, setReason] = useState("litigation");
  const [holdType, setHoldType] = useState("tenant");
  const [holdResource, setHoldResource] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const holdResourceRef = useRef<HTMLInputElement>(null);
  async function refresh() {
    const response = await fetch("/api/lifecycle", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load lifecycle state. Check your admin access and retry.");
    const state: Status = await response.json(); setData(state); setReceipt(state.deletion);
  }
  useEffect(() => {
    let active = true;
    fetch("/api/lifecycle", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Could not load lifecycle state. Check admin access and retry.");
      const state: Status = await response.json();
      if (active) { setData(state); setReceipt(state.deletion); }
    }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (error.startsWith("Enter the exact")) confirmationRef.current?.focus(); else if (error.startsWith("Enter a resource")) holdResourceRef.current?.focus(); else if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if ((!confirmation && !holdResource) || receipt?.state === "completed") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor && !anchor.getAttribute("href")?.startsWith("#") && !window.confirm("Discard unsaved lifecycle form text and leave this page?")) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigate, true); };
  }, [confirmation, holdResource, receipt?.state]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(action); setError(""); setNotice("");
    try {
      const response = await fetch("/api/lifecycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Operation unavailable. Retry.");
      if (["request", "confirm", "advance"].includes(action)) setReceipt(result);
      if (action === "export") { setExportId(result.id); setNotice("Export ready. Download within 24 hours."); }
      else if (action === "confirm") { setConfirmation(""); setExportId(null); setNotice("Deletion confirmed. Writes are fenced. Continue to delete the next batch."); }
      else if (action === "advance") setNotice(result.state === "completed" ? "Deletion completed. Save your receipt below." : "Batch committed. Continue when ready; progress survives interruption.");
      else { setNotice("Operation recorded."); if (action === "hold") setHoldResource(""); }
      if (!["advance", "confirm", "request"].includes(action)) await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Operation unavailable. Retry."); }
    finally { setBusy(null); }
  }
  function label(action: string, text: string) { return <>{busy === action && <span aria-hidden="true" className="mr-2 inline-block size-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />}{text}</>; }
  return <div id="lifecycle-controls" className="space-y-6">
    <p role="status" aria-live="polite" className="text-sm">{busy ? "Processing…" : notice || (data ? "Policy cb18.v1 · Manual operations only" : "Loading…")}</p>
    {error && <p id="lifecycle-error" ref={errorRef} tabIndex={-1} role="alert" className="rounded-md border border-destructive p-3 text-sm">{error}</p>}
    {!data && <button className={button} disabled={!!busy} onClick={() => { setError(""); refresh().catch((e: Error) => setError(e.message)); }}>Retry loading</button>}
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="policy-title">
      <h2 id="policy-title" className="scroll-mt-6 text-lg font-semibold">Retention policy</h2>
      <p className="text-sm text-muted-foreground">Conversation content and evidence: 180 days. Reviews, outcomes, settings, audit and financial summaries: 365 days. Terminal jobs: 30 days; classification cache: 7 days. Export bundles: 24 hours. No automatic sweep runs.</p>
      <p className="text-sm">Legal holds block expiry and deletion. Resource holds conservatively protect the whole workspace and its related copies. Admin export remains available.</p>
      <button className={button} disabled={!!busy || !data || !!receipt && receipt.state !== "requested"} onClick={() => { if (window.confirm("Run one retention batch? Expired content is permanently removed or anonymized.")) void act("sweep"); }}>{label("sweep", "Run retention batch")}</button>
    </section>
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="hold-title">
      <h2 id="hold-title" className="scroll-mt-6 text-lg font-semibold">Legal holds</h2>
      {data?.holds.length ? <ul className="space-y-2">{data.holds.map(hold => <li key={hold.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words text-sm">{hold.reason_code} · {hold.resource_type}</span><button className={button} disabled={!!busy} onClick={() => { if (window.confirm("Release this legal hold? Retention and deletion may proceed afterward.")) void act("release", { id: hold.id }); }}>Release hold…</button></li>)}</ul> : <p className="text-sm text-muted-foreground">No active holds.</p>}
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (holdType !== "tenant" && !holdResource.trim()) { setError("Enter a resource ID for this hold."); return; } void act("hold", { reason_code: reason, resource_type: holdType, resource_id: holdType === "tenant" ? null : holdResource.trim() }); }}>
        <label className="grid gap-1 text-sm">Reason code<select className="min-h-11 rounded-md border bg-background px-3 text-base text-foreground" name="reason_code" value={reason} onChange={e => setReason(e.target.value)}><option value="litigation">Litigation</option><option value="regulatory">Regulatory</option><option value="investigation">Investigation</option></select></label>
        <label className="grid gap-1 text-sm">Scope<select className="min-h-11 rounded-md border bg-background px-3 text-base text-foreground" name="resource_type" value={holdType} onChange={e => setHoldType(e.target.value)}><option value="tenant">Workspace</option><option value="conversation">Conversation</option><option value="upload">Upload</option></select></label>
        {holdType !== "tenant" && <label className="grid min-w-0 gap-1 text-sm">Resource ID<input className="min-h-11 min-w-0 rounded-md border bg-background px-3 text-base" ref={holdResourceRef} aria-invalid={error.startsWith("Enter a resource")} aria-describedby={error.startsWith("Enter a resource") ? "lifecycle-error" : undefined} name="resource_id" autoComplete="off" spellCheck={false} value={holdResource} onChange={e => setHoldResource(e.target.value)} maxLength={256} /></label>}
        <button className={button} disabled={!!busy || !data || receipt?.state === "completed"}>{label("hold", "Place legal hold")}</button>
      </form>
    </section>
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="export-title">
      <h2 id="export-title" className="scroll-mt-6 text-lg font-semibold">Tenant export</h2>
      <p className="text-sm text-muted-foreground">Private JSON snapshot with a versioned manifest and SHA-256 checksums. Excludes keys and shared user records. Deletion confirmation immediately revokes downloads.</p>
      <button className={button} disabled={!!busy || !data || !!receipt && receipt.state !== "requested"} onClick={() => void act("export")}>{label("export", "Create export")}</button>
      {exportId && <a className={`${button} inline-flex items-center`} href={`/api/lifecycle?export=${encodeURIComponent(exportId)}`}>Download JSON bundle</a>}
    </section>
    <section className="space-y-3 rounded-lg border border-destructive/50 p-4" aria-labelledby="delete-title">
      <h2 id="delete-title" className="scroll-mt-6 text-lg font-semibold">Delete workspace permanently</h2>
      <p className="text-sm">Confirmation fences work and revokes exports immediately. Each continuation permanently deletes one bounded batch. Shared users with other memberships remain. Public pilot requests stay under operator ownership. Audit, financial totals and counts-only tombstones remain under policy.</p>
      <p className="text-sm text-muted-foreground">Backups expire on the hosting provider’s natural retention window. Immediate backup deletion is not promised. Save the final receipt before leaving; workspace membership is removed at completion.</p>
      {!receipt && <button className={button} disabled={!!busy || !data} onClick={() => void act("request")}>{label("request", "Request deletion…")}</button>}
      {receipt?.state === "requested" && <form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (confirmation !== `DELETE ${tenant}`) { setError("Enter the exact confirmation text shown below."); confirmationRef.current?.focus(); return; } void act("confirm", { id: receipt.id, confirmation }); }}>
        <label className="grid gap-1 text-sm">Type <strong className="break-words" translate="no">DELETE {tenant}</strong><input ref={confirmationRef} className="min-h-11 min-w-0 rounded-md border bg-background px-3 text-base" name="confirmation" autoComplete="off" spellCheck={false} value={confirmation} onChange={e => setConfirmation(e.target.value)} aria-invalid={!!error && error.startsWith("Enter the exact")} aria-describedby={error ? "confirm-help lifecycle-error" : "confirm-help"} /></label>
        <p id="confirm-help" className="text-sm">This exact text confirms the irreversible workspace deletion.</p>
        <button className={button} disabled={!!busy}>{label("confirm", "Confirm permanent deletion")}</button>
      </form>}
      {receipt && <div aria-live="polite" className="space-y-2 text-sm tabular-nums"><p>Status: <strong>{receipt.state}</strong> · Step {new Intl.NumberFormat().format(receipt.checkpoint)} of {receipt.steps}</p>{receipt.reason_code && <p>Blocked: {receipt.reason_code}. Release the hold before continuing.</p>}{receipt.state !== "requested" && receipt.state !== "completed" && <button className={button} disabled={!!busy} onClick={() => void act("advance", { id: receipt.id })}>{label("advance", "Continue deletion batch")}</button>}{receipt.state === "completed" && <button className={button} onClick={() => saveReceipt(receipt)}>Save deletion receipt</button>}</div>}
    </section>
    <section className="space-y-3" aria-labelledby="audit-title"><h2 id="audit-title" className="scroll-mt-6 text-lg font-semibold">Recent audit events</h2><p className="text-sm text-muted-foreground">Latest 50 events. Metadata only.</p><ul className="space-y-2">{data?.audit.slice(0, 50).map(event => <li key={event.id} className="break-words rounded border p-3 text-sm">{event.operation} · {event.result} · <time dateTime={event.created_at}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</time></li>)}</ul>{data?.audit.length === 0 && <p className="text-sm">No audit events yet.</p>}</section>
  </div>;
}
