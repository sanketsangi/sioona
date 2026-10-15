import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
/** CB-16 authorizes the verified Intercom webhook only. No shared-secret bypass. */
export async function POST() {
  return NextResponse.json({ error: "live_source_not_enabled", sent: false }, { status: 404 });
}
