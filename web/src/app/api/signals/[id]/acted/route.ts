import { NextResponse } from "next/server";
import { setPredictionActed } from "@/lib/backend-client";
import { setSignalActed } from "@/lib/store";

/**
 * Shadow Mode: persist `status: acted` on the JSON store.
 * Dual-writes to FastAPI when backendSignalId exists (fail-soft).
 * Does not call Intercom/WhatsApp/email or execute suggestedAction.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    acted?: unknown;
  };

  if (typeof body.acted !== "boolean") {
    return NextResponse.json(
      { error: "acted must be true or false" },
      { status: 400 }
    );
  }

  const result = await setSignalActed(id, body.acted);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Signal must be reviewed before marking acted" },
      { status: 400 }
    );
  }

  const backendSignalId = result.signal.backendSignalId;
  if (backendSignalId) {
    try {
      await setPredictionActed(
        result.signal.tenantId,
        backendSignalId,
        body.acted
      );
    } catch {
      // JSON is still SoT when the file exists; hydrate restores Acted once Neon has it.
    }
  }

  return NextResponse.json({ signal: result.signal });
}
