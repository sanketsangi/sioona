import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { ViewFrame } from "@/components/ViewFrame";
import { EconomicsDashboard } from "@/components/EconomicsDashboard";
import { accountSurface } from "@/lib/account-surface";
import { BackendClientError, getEconomicsDashboard } from "@/lib/backend-client";
import { authEnforced, publicDemoEnabled, SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tenant Economics" };

function isoStart(value?: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return undefined;
  return new Date(date.getTime() - 330 * 60_000).toISOString();
}

function isoExclusiveEnd(value?: string): string | undefined {
  const start = isoStart(value);
  return start ? new Date(new Date(start).getTime() + 86_400_000).toISOString() : undefined;
}

export default async function EconomicsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/?view=insights");

  let data = null;
  let error: string | null = null;
  try {
    data = await getEconomicsDashboard(session.tenantId, isoStart(params.from), isoExclusiveEnd(params.to));
  } catch (caught) {
    error = caught instanceof BackendClientError ? caught.message : "Economics data is unavailable.";
  }
  const account = accountSurface({ session, authOn: authEnforced(), publicDemo: publicDemoEnabled() });
  return (
    <AppShell activeView="economics" title="Economics" account={account} showDemoActions={false}>
      <ViewFrame className="overflow-y-auto"><a href="/lifecycle" className="mb-4 inline-flex min-h-11 items-center underline focus-visible:outline-2">Workspace data lifecycle</a>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 className="text-balance text-heading-20">Economics and reliability</h2><p className="mt-1 text-sm text-muted-foreground">Measured canonical Postgres data for your workspace.</p></div>
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Dashboard date window">
          <label className="grid gap-1 text-sm"><span>From</span><input className="h-11 rounded-md border border-input bg-background px-3 text-base" name="from" type="date" defaultValue={params.from} /></label>
          <label className="grid gap-1 text-sm"><span>Through</span><input className="h-11 rounded-md border border-input bg-background px-3 text-base" name="to" type="date" defaultValue={params.to} /></label>
          <button className="btn-primary h-11 touch-manipulation" type="submit">Apply window</button>
        </form>
      </div>
      {error ? <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-5"><h2 className="font-semibold">Dashboard unavailable</h2><p className="mt-1 text-sm">{error}</p><a className="mt-3 inline-flex underline focus-visible:outline-2 focus-visible:outline-offset-2" href="/economics">Retry with the default window</a></div> : data ? <EconomicsDashboard data={data} /> : null}
      </ViewFrame>
    </AppShell>
  );
}
