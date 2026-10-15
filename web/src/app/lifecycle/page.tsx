import type { Metadata } from "next";
import Link from "next/link";
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
  return <main id="main-content" className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
    <a href="#lifecycle-controls" className="sr-only touch-manipulation focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Skip to controls</a>
    <Link href="/?view=insights" className="inline-flex min-h-11 touch-manipulation items-center underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Back to workspace</Link>
    <h1 className="text-balance text-2xl font-semibold">Workspace data lifecycle</h1>
    <p className="break-words text-foreground">Workspace: <strong translate="no">{session.tenantId}</strong>. Only verified workspace admins can use these controls.</p>
    <LifecycleControls tenant={session.tenantId} />
  </main>;
}
