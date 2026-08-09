import { NextResponse } from "next/server";
import { SIGNAL_TAXONOMY } from "@/lib/taxonomy";

export async function GET() {
  return NextResponse.json({ taxonomy: SIGNAL_TAXONOMY });
}
