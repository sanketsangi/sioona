import { runWithTenant } from "@/lib/tenant-context";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth-guard";
import {
  BackendClientError,
  setPredictionOutcome,
  type BackendSignalOutcome,
} from "@/lib/backend-client";
import { resolveFeedbackSignal } from "@/lib/resolve-feedback-signal";
import { readStore, writeStore } from "@/lib/store";
import type { SignalOutcome } from "@/lib/types";

const OUTCOMES = new Set<SignalOutcome>([
  "retained",
  "churned",
  "converted",
  "no_change",
  "unknown",
]);

type OutcomeBody = {
  outcome?: unknown;
  valueInr?: unknown;
  recordedOn?: unknown;
  backendSignalId?: unknown;
};

function asOutcome(value: unknown): SignalOutcome | null {
  if (typeof value !== "string") return null;
  return OUTCOMES.has(value as SignalOutcome) ? (value as SignalOutcome) : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(request, "mutate");
  if (session instanceof NextResponse) return session;
  return runWithTenant(session.tenantId, async () => {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as OutcomeBody;
    const outcome = asOutcome(body.outcome);
    if (!outcome) {
      return NextResponse.json(
        { error: "Outcome must be retained, churned, converted, no change, or unknown." },
        { status: 400 },
      );
    }
    let valueInr: number | null = null;
    if (body.valueInr != null && body.valueInr !== "") {
      const parsed = typeof body.valueInr === "number" ? body.valueInr : Number(body.valueInr);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: "Value must be a rupee amount of zero or more." },
          { status: 400 },
        );
      }
      valueInr = parsed;
    }
    const recordedOn =
      typeof body.recordedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.recordedOn)
        ? body.recordedOn
        : null;

    const store = await readStore();
    const existing = resolveFeedbackSignal(store.signals, id, {
      backendSignalId:
        typeof body.backendSignalId === "string" ? body.backendSignalId : undefined,
    });
    const neonId =
      (typeof body.backendSignalId === "string" && body.backendSignalId.trim()) ||
      existing?.backendSignalId;
    if (!neonId) {
      return NextResponse.json(
        { error: "This signal is not in Neon yet. Retry after the upload finishes syncing." },
        { status: 409 },
      );
    }

    try {
      const row = await setPredictionOutcome(existing?.tenantId ?? store.tenant.id, neonId, {
        outcome: outcome as BackendSignalOutcome,
        value_inr: valueInr,
        recorded_on: recordedOn,
      });
      if (existing) {
        existing.outcome = {
          outcome,
          ...(valueInr != null ? { valueInr } : {}),
          recordedAt: row.outcome_recorded_at ?? new Date().toISOString(),
        };
        existing.backendSignalId = row.id;
        await writeStore(store);
      }
      return NextResponse.json({
        signal: existing ?? null,
        outcome,
        valueInr,
        recordedAt: row.outcome_recorded_at,
      });
    } catch (err) {
      const message =
        err instanceof BackendClientError
          ? err.message
          : "Could not save the outcome.";
      const status = err instanceof BackendClientError && err.status === 404 ? 404 : 503;
      return NextResponse.json({ error: message }, { status });
    }
  });
}
