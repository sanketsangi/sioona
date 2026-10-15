import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { externalActionRequest } from "@/lib/backend-client";
import { runWithTenant } from "@/lib/tenant-context";
import { getStateMode } from "@/lib/state-mode";
const headers = { "Cache-Control": "no-store" };
async function handle(request: Request, mutation: boolean) {
  const actor = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (actor?.role !== "admin") return Response.json({ error: "Admin sign-in required" }, { status: 403, headers });
  if (getStateMode() !== "postgres") return Response.json({ error: "Canonical Postgres required" }, { status: 409, headers });
  let path = "";
  let body: unknown;
  if (mutation) {
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Same-origin request required" }, { status: 403, headers });
    const raw = await request.text();
    if (raw.length > 16000) return Response.json({ error: "Request too large" }, { status: 413, headers });
    try {
      const input = JSON.parse(raw);
      if (!input || typeof input !== "object") throw new Error();
      const { action, id, ...payload } = input;
      if (action === "propose") path = "/proposals";
      else if (["approve", "execute", "reconcile"].includes(action) && typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)) path = action === "approve" ? `/proposals/${id}/approve` : `/executions/${id}/${action}`;
      else throw new Error();
      body = action === "execute" ? undefined : payload;
    } catch { return Response.json({ error: "Invalid action request" }, { status: 400, headers }); }
  }
  return runWithTenant(actor.tenantId, async () => {
    try { return Response.json(await externalActionRequest(actor.tenantId, path, mutation ? "POST" : "GET", body), { headers }); }
    catch { return Response.json({ error: "Action unavailable or blocked. Refresh to inspect its persisted state. An unknown result requires admin reconciliation; do not resubmit." }, { status: 409, headers }); }
  });
}
export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
