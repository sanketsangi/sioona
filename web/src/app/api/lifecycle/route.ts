import { getStateMode } from "@/lib/state-mode";
import { cookies } from "next/headers";
import { BackendClientError, lifecycleRequest } from "@/lib/backend-client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { runWithTenant } from "@/lib/tenant-context";

const headers = { "Cache-Control": "no-store" };
async function session() {
  const jar = await cookies();
  const value = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  return value?.role === "admin" ? value : null;
}
function failure(error: unknown) {
  const status = error instanceof BackendClientError ? error.status ?? 503 : 503;
  // Only bounded public lifecycle reason codes receive specific recovery text.
  const recovery: Record<string, string> = {
    export_too_large: "This workspace exceeds the current export limit. Ask an operator to arrange an approved export.",
    export_unavailable: "This export expired or was revoked. Create a new export if the workspace is active.",
    legal_hold: "An active legal hold blocks this operation. Review the holds before retrying.",
    confirmation_mismatch: "The confirmation text must exactly match the workspace shown.",
    tenant_deleting: "Deletion has fenced this workspace. Continue deletion or review its receipt.",
  };
  if (error instanceof BackendClientError && recovery[error.message]) return Response.json({ error: recovery[error.message] }, { status, headers });
  // No provider/SQL error text reaches the browser.
  return Response.json({ error: status === 409 ? "Operation blocked. Check legal holds, confirmation, and lifecycle state, then retry." : "Lifecycle unavailable. Refresh and try again." }, { status, headers });
}
export async function GET(request: Request) {
  if (getStateMode() !== "postgres") return Response.json({ error: "Lifecycle controls require canonical Postgres mode. JSON demo data has a separate reset flow." }, { status: 409, headers });
  const actor = await session();
  if (!actor) return Response.json({ error: "Admin sign-in required" }, { status: 403, headers });
  const exportId = new URL(request.url).searchParams.get("export");
  if (exportId && !/^[0-9a-f-]{36}$/.test(exportId)) return Response.json({ error: "Invalid export" }, { status: 400, headers });
  return runWithTenant(actor.tenantId, async () => {
    try {
      const data = await lifecycleRequest(actor.tenantId, exportId ? `/exports/${exportId}` : "");
      return Response.json(data, { headers: { ...headers, ...(exportId ? { "Content-Disposition": 'attachment; filename="sioona-export.json"' } : {}) } });
    } catch (error) { return failure(error); }
  });
}
export async function POST(request: Request) {
  if (getStateMode() !== "postgres") return Response.json({ error: "Lifecycle controls require canonical Postgres mode. JSON demo data has a separate reset flow." }, { status: 409, headers });
  const actor = await session();
  if (!actor) return Response.json({ error: "Admin sign-in required" }, { status: 403, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Same-origin request required" }, { status: 403, headers });
  const raw = await request.text();
  if (raw.length > 1024) return Response.json({ error: "Request too large" }, { status: 413, headers });
  let input: { action?: string; id?: string; confirmation?: string; reason_code?: string; resource_type?: string; resource_id?: string | null };
  try { input = JSON.parse(raw); } catch { return Response.json({ error: "Invalid request" }, { status: 400, headers }); }
  if (!input || typeof input !== "object") return Response.json({ error: "Invalid request" }, { status: 400, headers });
  const paths: Record<string, string> = { export: "/exports", request: "/deletions", sweep: "/retention/sweep", hold: "/holds" };
  let path = paths[input.action ?? ""];
  let body: unknown;
  if (input.action === "hold") body = { reason_code: input.reason_code, resource_type: input.resource_type ?? "tenant", resource_id: input.resource_id ?? null };
  if (["confirm", "advance", "release"].includes(input.action ?? "")) {
    if (typeof input.id !== "string" || !/^[0-9a-f-]{36}$/.test(input.id)) return Response.json({ error: "Invalid request ID" }, { status: 400, headers });
    path = input.action === "release" ? `/holds/${input.id}/release` : `/deletions/${input.id}/${input.action}`;
    if (input.action === "confirm") body = { confirmation: input.confirmation };
  }
  if (!path) return Response.json({ error: "Invalid action" }, { status: 400, headers });
  return runWithTenant(actor.tenantId, async () => {
    try { return Response.json(await lifecycleRequest(actor.tenantId, path, "POST", body), { headers }); }
    catch (error) { return failure(error); }
  });
}
