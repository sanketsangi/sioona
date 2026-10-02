import { NextResponse } from "next/server";
import { normalizeContact, validateContact, type ContactValues } from "@/lib/contact";

/**
 * Stub route handler. It validates the payload and returns success.
 * Nothing is stored, forwarded or logged: wire a real destination here later.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const values = normalizeContact(payload as Partial<ContactValues>);
  const errors = validateContact(values);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
