import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ViewFrame } from "@/components/ViewFrame";
import { PilotChecklist } from "@/components/PilotChecklist";
import { accountSurface } from "@/lib/account-surface";
import {
  authEnforced,
  publicDemoEnabled,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/auth-token";
import { DEMO_TENANT_ID, runWithTenant } from "@/lib/tenant-context";
import { readStore } from "@/lib/store";
import { queryRevenueReport } from "@/lib/revenue-report-query";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guided pilot | Sioona" };
export default async function PilotPage({
  searchParams,
}: {
  searchParams: Promise<{
    uploadId?: string;
    file?: string;
    scoreFrom?: string;
    scoreTo?: string;
  }>;
}) {
  const session = await verifySessionToken(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  if (authEnforced() && !session && !publicDemoEnabled()) redirect("/login");
  return runWithTenant(session?.tenantId ?? DEMO_TENANT_ID, async () => {
    let result;
    try {
      result = await queryRevenueReport(await readStore(), await searchParams);
    } catch {
      result = null;
    }
    return (
      <AppShell
        activeView="pilot"
        title="Guided pilot"
        account={accountSurface({
          session,
          authOn: authEnforced(),
          publicDemo: publicDemoEnabled(),
        })}
        showDemoActions={false}
      >
        <ViewFrame className="overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-5 pb-8">
            <h2 className="text-heading-24">Run a Shadow Mode pilot</h2>
            <p>
              Upload an approved redacted export or a synthetic sample. Review
              source evidence before recording outcomes.
            </p>
            <Link href="/pilot-request" className="btn-primary min-h-11">
              Request a pilot
            </Link>
            {result ? (
              <PilotChecklist
                {...result.workflow}
                query={result.query.toString()}
                disabled={!!(result.scopeError || result.rangeError)}
              />
            ) : (
              <p role="status">
                Workspace progress is unavailable.{" "}
                <Link href="/pilot" className="underline">
                  Retry
                </Link>{" "}
                or{" "}
                <Link href="/?view=upload" className="underline">
                  open uploads
                </Link>
                .
              </p>
            )}
            <Link
              href="/?view=report"
              className="inline-flex min-h-11 items-center underline"
            >
              Open executive revenue report
            </Link>
          </div>
        </ViewFrame>
      </AppShell>
    );
  });
}
