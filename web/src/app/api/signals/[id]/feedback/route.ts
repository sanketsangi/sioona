import { NextResponse } from "next/server";
import { setSignalFeedback } from "@/lib/store";
import type { FeedbackLabel } from "@/lib/types";

const LABELS: FeedbackLabel[] = ["accept", "reject", "wrong_reason"];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    label?: FeedbackLabel;
    note?: string;
  };

  if (!body.label || !LABELS.includes(body.label)) {
    return NextResponse.json(
      { error: "label must be accept | reject | wrong_reason" },
      { status: 400 }
    );
  }

  const signal = await setSignalFeedback(id, body.label, body.note);
  if (!signal) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  return NextResponse.json({ signal });
}
