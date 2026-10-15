"use client";
import { useEffect, useState } from "react";
type Proposal = { id: string; target: string; action_version: number; payload_sha256: string; payload_json: {body: string}; state: string };
type Execution = { id: string; proposal_id: string; state: string; expires_at: string };
export function ExternalActionControls() {
  const [data, setData] = useState<{proposals: Proposal[]; executions: Execution[]; decisions: {id: string; conversation_id: string}[]}>({proposals: [], executions: [], decisions: []});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    const navigate = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (dirty && link && !link.getAttribute("href")?.startsWith("#") && !window.confirm("Discard the unsaved internal note?")) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  async function refresh() {
    try {
      const response = await fetch("/api/external-actions", {cache: "no-store"});
      if (!response.ok) throw new Error();
      setData(await response.json());
    } catch { setMessage("Actions unavailable. Sign in as an admin and refresh."); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/external-actions", {cache: "no-store", signal: controller.signal})
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(setData).catch(() => { if (!controller.signal.aborted) setMessage("Actions unavailable. Sign in as an admin and refresh."); });
    return () => controller.abort();
  }, []);
  async function act(body: {action: string; [key: string]: unknown}) {
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/external-actions", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
      if (!response.ok) throw new Error();
      if (body.action === "propose") setDirty(false);
      setMessage("Persisted. Review the status below.");
    } catch { setMessage("Action blocked or result unavailable. Refresh the persisted status. Never retry an unknown result; reconcile it with provider evidence."); }
    finally { setPending(false); await refresh(); }
  }
  const button = "min-h-11 touch-manipulation rounded border border-current px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60";
  const input = "block min-h-11 w-full rounded border border-current bg-background p-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  return <section className="space-y-6">
    <a href="#proposal-form" className="sr-only focus:not-sr-only focus-visible:outline">Skip to proposal</a>
    <p role="status" aria-live="polite">{message}</p>
    <button type="button" className={button} onClick={() => void refresh()}>Refresh status</button>
    <form id="proposal-form" className="space-y-3" onChange={e => {
      setDirty(true);
      const field = e.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      setErrors(previous => ({...previous, [field.name]: ""}));
    }} onInvalidCapture={e => {
      const field = e.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      setErrors(previous => ({...previous, [field.name]: field.validationMessage}));
    }} onSubmit={e => {
      e.preventDefault(); const fields = new FormData(e.currentTarget);
      void act({action: "propose", decision_id: fields.get("decision_id"), target: fields.get("target"), body: fields.get("body")});
    }}>
      <fieldset disabled={pending} className="space-y-3">
      <legend className="text-xl">Propose or edit a note</legend>
      <p>A new version invalidates prior approval. Enter the existing draft decision ID and an operator-allowlisted sandbox conversation.</p>
      <label className="block">Existing draft decision<select className={input} name="decision_id" required defaultValue="" aria-invalid={!!errors.decision_id} aria-describedby="decision-error" style={{backgroundColor: "var(--background)", color: "var(--foreground)"}}><option value="">Choose a reviewed draft…</option>{data.decisions.map(d => <option key={d.id} value={d.id}>{d.conversation_id} · {d.id}</option>)}</select></label>
      <p id="decision-error" aria-live="polite">{errors.decision_id}</p>
      <label className="block">Sandbox conversation ID<input className={input} name="target" inputMode="numeric" autoComplete="off" pattern="[0-9]{1,128}" aria-invalid={!!errors.target} aria-describedby="target-error" required /></label>
      <p id="target-error" aria-live="polite">{errors.target}</p>
      <label className="block">Internal note<textarea className={input} name="body" maxLength={10000} aria-invalid={!!errors.body} aria-describedby="body-error" required onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); }} /></label>
      <p id="body-error" aria-live="polite">{errors.body}</p>
      <button className={button} disabled={pending}>{pending && <span aria-hidden="true" className="mr-2 inline-block motion-safe:animate-spin">◌</span>}Save proposal</button>
      </fieldset>
    </form>
    <h2 className="text-xl">Exact proposals and execution results</h2>
    {!data.proposals.length && <p>No proposals. Save an internal note to begin.</p>}
    {data.proposals.map(p => {
      const execution = data.executions.find(e => e.proposal_id === p.id);
      return <article key={p.id} className="min-w-0 space-y-3 break-words rounded border border-current p-4">
        <h3>Sandbox conversation {p.target} · version {p.action_version}</h3>
        <pre className="whitespace-pre-wrap break-words">{JSON.stringify(p.payload_json, null, 2)}</pre>
        <p className="break-all" translate="no">SHA-256: {p.payload_sha256}</p>
        <p>Status: {execution?.state ?? p.state}</p>
        {execution && <p>Approval expires: {new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"}).format(new Date(execution.expires_at))}</p>}
        {p.state === "proposed" && !execution && <button className={button} disabled={pending} onClick={() => void act({action: "approve", id: p.id, target: p.target, action_version: p.action_version, payload_sha256: p.payload_sha256, expires_at: new Date(Date.now()+5*60000).toISOString()})}>Approve exact note for 5 minutes</button>}
        {execution?.state === "approved" && <button className={button} disabled={pending} onClick={() => { if (window.confirm(`Post this exact internal note to sandbox conversation ${p.target}?`)) void act({action: "execute", id: execution.id}); }}>Post approved sandbox note</button>}
        {execution && ["attempted", "unknown"].includes(execution.state) && <form onSubmit={e => {
          e.preventDefault(); const fields = new FormData(e.currentTarget);
          if (window.confirm("Record the result verified directly in Intercom? This does not resend the note.")) void act({action: "reconcile", id: execution.id, state: fields.get("state"), provider_receipt: fields.get("receipt")});
        }} className="space-y-3">
          <p>Do not retry. Verify the note in Intercom, then record provider evidence.</p>
          <label className="block">Verified result<select name="state" className={input} style={{backgroundColor: "var(--background)", color: "var(--foreground)"}}><option value="succeeded">Succeeded</option><option value="failed">Failed, verified absent</option></select></label>
          <label className="block">Provider receipt or investigation reference<input className={input} name="receipt" required pattern="[A-Za-z0-9_-]{1,128}" autoComplete="off" /></label>
          <button className={button} disabled={pending}>Record reconciliation</button>
        </form>}
      </article>;
    })}
  </section>;
}
