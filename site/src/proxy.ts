import { publicHeaders } from "@/lib/http-headers";
import { markdownDocument } from "@/lib/markdown-pages";
import { NextResponse, type NextRequest } from "next/server";

function continueWithVary() {
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(publicHeaders)) response.headers.set(key, value);
  return response;
}

export function proxy(request: NextRequest) {
  const document = markdownDocument(request.nextUrl.pathname, request.headers.get("accept"));
  if (!document) return continueWithVary();
  return new NextResponse(document.body, {
    status: document.status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      ...publicHeaders,
      "cache-control": "public, max-age=0, must-revalidate",
      ...(document.status === 404 ? { "x-robots-tag": "noindex" } : {}),
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
