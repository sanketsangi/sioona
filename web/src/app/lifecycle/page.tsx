import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { ViewFrame } from "@/components/ViewFrame";
import { accountSurface } from "@/lib/account-surface";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { LifecycleControls } from "@/components/LifecycleControls";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workspace data lifecycle | Sioona" };
export default async function LifecyclePage() {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/?view=insights");
  const account = accountSurface({ session, authOn: true, publicDemo: false });
  return <AppShell activeView="lifecycle" title="Data lifecycle" account={account} showDemoActions={false}>
    <ViewFrame className="overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <p className="break-words text-copy-14 text-sio-fg-subtle">Workspace: <strong translate="no">{session.tenantId}</strong>. Only verified workspace admins can use these controls.</p>
        <LifecycleControls tenant={session.tenantId} />
      </div>
    </ViewFrame>
  </AppShell>;
}
