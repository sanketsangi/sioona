import { publicHeaders } from "@/lib/http-headers";
import { indexNowKey } from "@/lib/search-verification";

export const dynamic = "force-dynamic";

export function GET() {
  const key = indexNowKey();
  return new Response(key ?? "Not configured", {
    status: key ? 200 : 404,
    headers: { ...publicHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
