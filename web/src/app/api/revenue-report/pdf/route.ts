import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
import { buildRevenueLeakPdf } from "@/lib/revenue-leak-pdf";
import { buildRevenueLeakReport } from "@/lib/revenue-leak";
import { inspectSignalScoreWindow } from "@/lib/signal-score-window";
import { readStore } from "@/lib/store";

export async function GET(request: Request) {
  const session = await requireApiSession(request, "read");
  if (session instanceof NextResponse) return session;
  const url = new URL(request.url);
  const reveal = url.searchParams.get("reveal") === "1";
  const store = await readStore();
  const window = inspectSignalScoreWindow({
    scoreFrom: url.searchParams.get("scoreFrom"),
  });
  const score = await fetchSignalScoreSafe(store.tenant.id, undefined, {
    dateFrom: window.resolvedFrom,
  });
  const reviewed = score?.reviewed_count ?? 0;
  const correct = score?.correct_count ?? 0;

  const report = buildRevenueLeakReport({
    signals: store.signals ?? [],
    conversations: store.conversations ?? [],
    messages: store.messages ?? [],
    windowLabel: window.label,
    fileLabel: store.pilot?.lastUploadedFileName ?? null,
    anonymised: !reveal,
    reviewed,
    correct,
  });
  const pdf = buildRevenueLeakPdf(report);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="sioona-revenue-leak.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
