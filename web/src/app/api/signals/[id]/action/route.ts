import { NextResponse } from "next/server";
import { resolveFeedbackSignal } from "@/app/api/signals/[id]/feedback/route";
import { decideSupervisedAction, persistSupervisedActions, readStore } from "@/lib/store";
import {
  findSupervisedAction,
  shouldGenerateRetentionEmail,
} from "@/lib/supervised-actions";
import type { SupervisedActionDecision } from "@/lib/types";

const DECISIONS = new Set<SupervisedActionDecision>([
  "approved",
  "edited",
  "dismissed",
]);

type ActionBody = {
  decision?: unknown;
  subject?: unknown;
  body?: unknown;
  backendSignalId?: string;
  conversationId?: string;
  type?: unknown;
};

function asDecision(raw: unknown): SupervisedActionDecision | null {
  if (typeof raw !== "string") return null;
  return DECISIONS.has(raw as SupervisedActionDecision)
    ? (raw as SupervisedActionDecision)
    : null;
}

/**
 * Supervised Action: generate-if-missing and record Approve / Edit / Dismiss.
 * Never sends email or executes outbound.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as ActionBody;

  try {
    const store = await readStore();
    const signal = resolveFeedbackSignal(store.signals, id, {
      backendSignalId: body.backendSignalId,
      conversationId: body.conversationId,
      type: body.type as "lead" | "retention" | "upsell" | undefined,
    });

    if (!signal) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    if (shouldGenerateRetentionEmail(signal)) {
      await persistSupervisedActions([signal], store.conversations);
    }

    const afterEnsure = await readStore();
    const action = findSupervisedAction(afterEnsure.supervisedActions, signal);
    if (!action) {
      return NextResponse.json(
        {
          error:
            "No retention email draft for this signal. Drafts are only generated for high-confidence retention.",
        },
        { status: 404 }
      );
    }

    const decision = asDecision(body.decision);
    if (!decision) {
      return NextResponse.json({ action });
    }

    const subject =
      typeof body.subject === "string" ? body.subject : undefined;
    const draftBody = typeof body.body === "string" ? body.body : undefined;
    const result = await decideSupervisedAction(action.id, decision, {
      subject,
      body: draftBody,
    });

    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Action not found" }, { status: 404 });
      }
      if (result.reason === "already_decided") {
        return NextResponse.json(
          { error: "This draft already has a decision." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Subject and body are required." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      action: result.action,
      sent: false,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save action decision";
    console.error("[supervised-action] decision failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
