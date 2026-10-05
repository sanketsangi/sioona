import { runWithTenant } from "@/lib/tenant-context";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { setConversationGroundTruth } from "@/lib/store";
import type { SignalType } from "@/lib/types";

const LABELS: Array<SignalType | "none"> = [
  "lead",
  "retention",
  "upsell",
  "none",
];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request, "mutate");
  if (session instanceof NextResponse) return session;
  return runWithTenant(session.tenantId, async () => {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      groundTruth?: SignalType | "none" | null;
    };

    if (body.groundTruth === null) {
      const store = await setConversationGroundTruth(id, null);
      if (!store) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      return NextResponse.json({ conversationId: id, groundTruth: null });
    }

    if (!body.groundTruth || !LABELS.includes(body.groundTruth)) {
      return NextResponse.json(
        { error: "groundTruth must be lead | retention | upsell | none | null" },
        { status: 400 }
      );
    }

    const store = await setConversationGroundTruth(id, body.groundTruth);
    if (!store) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({
      conversationId: id,
      groundTruth: body.groundTruth,
    });
  });
}
