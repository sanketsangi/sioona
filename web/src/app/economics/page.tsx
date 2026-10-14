import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { EconomicsDashboard } from "@/components/EconomicsDashboard";
import { accountSurface } from "@/lib/account-surface";
import { BackendClientError, getEconomicsDashboard } from "@/lib/backend-client";
import { authEnforced, publicDemoEnabled, SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tenant Economics" };

function isoStart(value?: string): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : undefined;
}

function isoExclusiveEnd(value?: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
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
    <AppShell activeView="economics" title="Tenant Economics" account={account} showDemoActions={false}>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="text-balance text-2xl font-semibold">Tenant economics and reliability</h1><p className="mt-1 text-sm text-muted-foreground">Measured canonical Postgres data for your workspace.</p></div>
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Dashboard date window">
          <label className="grid gap-1 text-sm"><span>From</span><input className="h-11 rounded-md border border-input bg-background px-3 text-base" name="from" type="date" defaultValue={params.from} /></label>
          <label className="grid gap-1 text-sm"><span>Through</span><input className="h-11 rounded-md border border-input bg-background px-3 text-base" name="to" type="date" defaultValue={params.to} /></label>
          <button className="btn-primary h-11 touch-manipulation" type="submit">Apply window</button>
        </form>
      </div>
      {error ? <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-5"><h2 className="font-semibold">Dashboard unavailable</h2><p className="mt-1 text-sm">{error}</p><a className="mt-3 inline-flex underline focus-visible:outline-2 focus-visible:outline-offset-2" href="/economics">Retry with the default window</a></div> : data ? <EconomicsDashboard data={data} /> : null}
    </AppShell>
  );
}
