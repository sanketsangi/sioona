import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ViewFrame } from "@/components/ViewFrame";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { accountSurface } from "@/lib/account-surface";
import { runWithTenant } from "@/lib/tenant-context";
import { readOperatorReadiness } from "@/lib/operator-readiness";
import {
  acceptanceGates,
  bootstrapEvidence,
} from "@/lib/operator-readiness-evidence";
import type { OperationalMetric } from "@/lib/backend-client";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operator readiness | Sioona" };
function metric(value: OperationalMetric) {
  return value.status === "available"
    ? `${Intl.NumberFormat().format(value.value)} ${value.unit} (${Intl.NumberFormat().format(value.samples)} samples)`
    : "Unavailable; no passing result inferred";
}
export default async function ReadinessPage() {
  const session = await verifySessionToken(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/?view=insights");
  const data = await runWithTenant(session.tenantId, () =>
    readOperatorReadiness(session.tenantId),
  );
  return (
    <AppShell
      activeView="readiness"
      title="Operator readiness"
      account={accountSurface({ session, authOn: true, publicDemo: false })}
      showDemoActions={false}
    >
      <ViewFrame className="overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 pb-8">
          <h2 className="text-heading-24">Readiness observations</h2>
          <p>
            Read-only observations for{" "}
            <strong translate="no">{session.tenantId}</strong>. This page does
            not approve a release or change pause controls.
          </p>
          <p className="text-sm">
            Observed{" "}
            {Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "long",
              timeZone: "Asia/Kolkata",
            }).format(new Date(data.observedAt))}
          </p>
          <section className="space-y-2" aria-labelledby="deployment-title">
            <h2 id="deployment-title" className="text-heading-18">
              Revision and schema
            </h2>
            <p className="break-all">
              Web revision:{" "}
              <span translate="no">
                {data.revision ??
                  "Unavailable; configure the immutable deployment SHA"}
              </span>
            </p>
            <p>
              Live backend revision and schema: unavailable from the current
              API. The liveness endpoint does not establish migration or
              deployment identity.
            </p>
            <p>
              Historical bootstrap schema:{" "}
              <span translate="no">{bootstrapEvidence.schema}</span>. An
              operator must verify current/head on the exact target.
            </p>
          </section>
          <section
            className="panel space-y-2 p-4"
            aria-labelledby="pause-title"
          >
            <h2 id="pause-title" className="text-heading-18">
              Effective inference pause
            </h2>
            {data.controls ? (
              <>
                <p>
                  {data.controls.enabled
                    ? "Enabled — effective inference admission is open"
                    : "Paused or unconfigured — effective inference admission is closed"}
                </p>
                <p className="tabular-nums">
                  Daily limit:{" "}
                  {data.controls.daily_attempt_limit ?? "Unconfigured"} · Run
                  limit: {data.controls.run_attempt_limit ?? "Unconfigured"}
                </p>
              </>
            ) : (
              <p role="status">Controls unavailable. Pause state is unknown.</p>
            )}
            <p className="text-sm">
              The API combines tenant and global controls. Independent
              global/worker pause propagation, provider state, live ingest and
              external-action configuration still require operator verification.
            </p>
          </section>
          <section className="space-y-2" aria-labelledby="ledger-title">
            <h2 id="ledger-title" className="text-heading-18">
              Ledger reconciliation observations
            </h2>
            {data.ledger ? (
              <>
                <p className="text-sm">
                  Tenant window: <time>{data.ledger.from}</time> through{" "}
                  <time>{data.ledger.to}</time>. These measurements do not prove
                  provider-side reconciliation.
                </p>
                <dl className="grid grid-cols-2 gap-3 tabular-nums">
                  {Object.entries({
                    Attempts: data.ledger.attempts,
                    "Unfinished attempts": data.ledger.unfinished,
                    "Unknown usage": data.ledger.unknownUsage,
                    "Unknown cost": data.ledger.unknownCost,
                    "Reservation drift": metric(data.ledger.reservationDrift),
                    "Ledger flush failures": metric(data.ledger.flushFailures),
                  }).map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="break-words">
                        {typeof value === "number"
                          ? Intl.NumberFormat().format(value)
                          : value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p role="status">
                Ledger observations unavailable. Zero failures or reconciliation
                are not assumed.
              </p>
            )}
            <Link
              href="/economics"
              className="inline-flex min-h-11 items-center underline"
            >
              Inspect economics and alerts
            </Link>
          </section>
          <section className="space-y-2" aria-labelledby="receipts-title">
            <h2 id="receipts-title" className="text-heading-18">
              Historical receipts and acceptance
            </h2>
            <p>
              {bootstrapEvidence.status}. Recorded{" "}
              <time>{bootstrapEvidence.timestamp}</time>;{" "}
              {bootstrapEvidence.memberships} synthetic memberships.
            </p>
            <p className="break-words text-sm" translate="no">
              Source: docs/development/evidence/staging-bootstrap-receipt.json ·
              baseline efdee0f1
            </p>
            <ul className="space-y-2">
              {acceptanceGates.map((gate) => (
                <li key={gate.id}>
                  <strong>{gate.id}</strong> — {gate.label}:{" "}
                  <span>
                    Pending operator sign-off in the repository record
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm">
              Source: LAUNCH_BLOCKERS_2026-10-17.md. Historical checks never
              become current hosted acceptance automatically.
            </p>
          </section>
          <Link href="/readiness" className="btn-secondary min-h-11">
            Refresh observations
          </Link>
          <Link
            href="/lifecycle"
            className="ml-3 inline-flex min-h-11 items-center underline"
          >
            Open data lifecycle
          </Link>
        </div>
      </ViewFrame>
    </AppShell>
  );
}
