// Liveness only: do not depend on authentication, databases or external services.
export function GET() {
  return Response.json({ status: "ok" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
