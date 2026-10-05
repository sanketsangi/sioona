import { readBoundedJson, RequestTooLarge } from "@/lib/bounded-json";
import { NextResponse } from "next/server";
import { normalizeContact, validateContact, type ContactValues } from "@/lib/contact";

export async function POST(request: Request) {
  const backend = process.env.PILOT_INTAKE_BACKEND_URL;
  const token = process.env.SIOONA_SERVICE_TOKEN;
  if (!backend || !token) return NextResponse.json({ ok: false, error: "Pilot requests are unavailable in this preview. Please try again later." }, { status: 503 });
  const key = request.headers.get("Idempotency-Key");
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) return NextResponse.json({ ok: false, error: "A request identity is required." }, { status: 400 });
  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch (error) {
    if (error instanceof RequestTooLarge) return NextResponse.json({ ok: false, error: "Request is too large." }, { status: 413 });
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

  try {
    const response = await fetch(`${backend.replace(/\/$/, "")}/v1/pilot-requests`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": key },
      body: JSON.stringify(values), signal: AbortSignal.timeout(10000), cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.receipt === key) return NextResponse.json({ ok: true, receipt: key });
    return NextResponse.json({ ok: false, error: response.status === 429 ? "Too many requests. Please retry tomorrow." : "We could not store your request. Please retry." }, { status: response.status === 429 ? 429 : 503 });
  } catch {
    return NextResponse.json({ ok: false, error: "We could not confirm receipt. Please retry." }, { status: 503 });
  }
}
