import { NextResponse } from "next/server";
import { computeEvalMetrics, computePilotMetrics } from "@/lib/eval";
import { readStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    metrics: computeEvalMetrics(store),
    pilot: computePilotMetrics(store),
  });
}
