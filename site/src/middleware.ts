import { prefersMarkdown } from "@/lib/content-negotiation";
import { markdownFor } from "@/lib/markdown-pages";
import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (!prefersMarkdown(request.headers.get("accept"))) {
    const response = NextResponse.next();
    response.headers.append("Vary", "Accept");
    return response;
  }
  const body = markdownFor(request.nextUrl.pathname);
  if (!body) return NextResponse.next();
  return new NextResponse(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept",
      "cache-control": "public, max-age=0, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}

export const config = {
  matcher: ["/", "/how-it-works", "/security", "/pricing", "/contact", "/privacy", "/terms"],
};
