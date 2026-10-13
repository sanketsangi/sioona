import { markdownDocument } from "@/lib/markdown-pages";
import { NextResponse, type NextRequest } from "next/server";

function continueWithVary() {
  const response = NextResponse.next();
  response.headers.set("Vary", "Accept");
  return response;
}

export function middleware(request: NextRequest) {
  const document = markdownDocument(request.nextUrl.pathname, request.headers.get("accept"));
  if (!document) return continueWithVary();
  return new NextResponse(document.body, {
    status: document.status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept",
      "cache-control": "public, max-age=0, must-revalidate",
      "x-content-type-options": "nosniff",
      ...(document.status === 404 ? { "x-robots-tag": "noindex" } : {}),
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
