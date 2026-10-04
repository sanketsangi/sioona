import { runWithTenant } from "@/lib/tenant-context";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { queryRevenueReport } from "@/lib/revenue-report-query";
import { buildRevenueLeakPdf } from "@/lib/revenue-leak-pdf";
import { readStore } from "@/lib/store";

export async function GET(request: Request) {
  const session = await requireApiSession(request, "read");
  if (session instanceof NextResponse) return session;
  return runWithTenant(session.tenantId, async () => {
    const url = new URL(request.url);
    const reveal = url.searchParams.get("reveal") === "1";
    const store = await readStore();
    const { report, scopeError } = await queryRevenueReport(store, {
      uploadId: url.searchParams.get("uploadId"),
      scoreFrom: url.searchParams.get("scoreFrom"), scoreTo: url.searchParams.get("scoreTo"), file: url.searchParams.get("file"), reveal,
    });
    if (scopeError) return NextResponse.json({ error: scopeError }, { status: 503 });
    const pdf = buildRevenueLeakPdf(report);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="sioona-revenue-leak.pdf"',
        "Cache-Control": "no-store",
      },
    });
  });
}
