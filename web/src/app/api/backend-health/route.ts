import { NextResponse } from "next/server";
import {
  BackendClientError,
  getBackendHealth,
} from "@/lib/backend-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Wake Render free-tier FastAPI via /health. Partner Insights/Eval call this
 * once on queue/score miss, then refresh. Fail-soft 503 — never leak env.
 */
export async function GET() {
  try {
    const body = await getBackendHealth();
    if (body.status === "ok") {
      return NextResponse.json({ status: "ok" });
    }
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  } catch (err) {
    const status = err instanceof BackendClientError ? err.status : undefined;
    return NextResponse.json(
      { status: "unavailable" },
      { status: status && status >= 400 && status < 600 ? status : 503 }
    );
  }
}
