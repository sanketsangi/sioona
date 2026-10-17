import { contactPolicy } from "@/lib/pilot-contact-policy";
import { readBoundedJson, RequestTooLarge } from "@/lib/pilot-bounded-json";
import { NextResponse } from "next/server";
import {
  normalizeContact,
  validateContact,
  hasContactHoneypot,
  type ContactValues,
} from "@/lib/pilot-contact";

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
function retryAfter(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{1,10}$/.test(value)) return value;
  if (
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  )
    return value;
  return null;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next's internal request URL can use localhost behind a bound listener or
  // TLS proxy. Compare the browser origin with the actual request Host; never
  // accept a client-selected destination or an x-forwarded-host override.
  const internal = new URL(request.url);
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol === "https" || forwardedProtocol === "http"
      ? forwardedProtocol
      : internal.protocol.slice(0, -1);
  const expectedOrigin = `${protocol}://${request.headers.get("host") ?? internal.host}`;
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin !== null && origin !== expectedOrigin)
  )
    return json(
      { ok: false, error: "Submit the form from this Sioona app." },
      403,
    );
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return json({ ok: false, error: "Use a JSON request." }, 415);
  // Revalidate operator-supplied policy on every request.
  try {
    contactPolicy({ ...process.env });
  } catch {
    return json(
      {
        ok: false,
        error:
          "We cannot accept requests right now. Please use the support email shown below.",
      },
      503,
    );
  }
  const backend = process.env.PILOT_INTAKE_BACKEND_URL;
  const token = process.env.SIOONA_SERVICE_TOKEN;
  if (!backend || !token)
    return json(
      {
        ok: false,
        error:
          "We cannot store your request right now. Retry safely, or use the support email shown below.",
      },
      503,
    );
  const key = request.headers.get("Idempotency-Key");
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key))
    return json({ ok: false, error: "A request identity is required." }, 400);
  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch (error) {
    if (error instanceof RequestTooLarge)
      return json({ ok: false, error: "Request is too large." }, 413);
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  if (typeof payload !== "object" || payload === null) {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  if (Array.isArray(payload))
    return json({ ok: false, error: "Invalid request body." }, 400);
  if (hasContactHoneypot(payload as Record<string, unknown>))
    return json(
      {
        ok: false,
        error:
          "We could not accept this request. Contact support if this continues.",
      },
      422,
    );
  const values = normalizeContact(payload as Partial<ContactValues>);
  const errors = validateContact(values);
  if (Object.keys(errors).length > 0) {
    return json({ ok: false, errors }, 422);
  }

  try {
    const response = await fetch(
      `${backend.replace(/\/$/, "")}/v1/pilot-requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify(values),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      },
    );
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok === true && result?.receipt === key)
      return json({ ok: true, receipt: key });
    const retry = retryAfter(response.headers.get("Retry-After"));
    return json(
      {
        ok: false,
        error:
          response.status === 429
            ? "Too many requests. Wait before retrying, or contact support."
            : "We could not store your request. Retry safely, or contact support.",
      },
      response.status === 429 ? 429 : 503,
      response.status === 429 && retry ? { "Retry-After": retry } : {},
    );
  } catch {
    return json(
      { ok: false, error: "We could not confirm receipt. Please retry." },
      503,
    );
  }
}
