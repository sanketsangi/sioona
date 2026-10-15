import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { ExternalActionControls } from "@/components/ExternalActionControls";
export const metadata: Metadata = { title: "Supervised sandbox actions | Sioona" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!actor) redirect("/login");
  if (actor.role !== "admin") redirect("/?view=insights");
  return <main id="main-content" className="mx-auto h-full max-w-3xl space-y-6 overflow-y-auto overscroll-contain px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
    <Link href="/?view=insights" className="inline-flex min-h-11 items-center underline">Back to workspace</Link>
    <h1 className="text-2xl font-semibold">Supervised sandbox actions</h1>
    <p>Internal Intercom operator notes only. Approve Draft grants no execution permission. Execution is disabled by default and requires sandbox configuration.</p>
    <ExternalActionControls />
  </main>;
}
