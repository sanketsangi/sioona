import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { runWithTenant } from "@/lib/tenant-context";
import { BackendClientError, getJobStatus } from "@/lib/backend-client";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const session = await requireApiSession(request, "read");
  if (session instanceof NextResponse) return session;
  const { jobId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(jobId)) return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  return runWithTenant(session.tenantId, async () => {
    try {
      return NextResponse.json(await getJobStatus(session.tenantId, jobId), { headers:{"Cache-Control":"no-store"} });
    } catch (error) {
      const status = error instanceof BackendClientError && [401,403,404].includes(error.status ?? 0) ? error.status! : 503;
      return NextResponse.json({ error: "Job status unavailable" }, { status, headers:{"Cache-Control":"no-store"} });
    }
  });
}
