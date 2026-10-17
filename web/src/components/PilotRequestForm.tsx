"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { useUnsavedNavigation } from "@/hooks/use-unsaved-navigation";
import {
  chatPlatforms,
  contactFieldOrder,
  emptyContact,
  normalizeContact,
  validateContact,
  type ContactErrors,
  type ContactValues,
} from "@/lib/pilot-contact";

const labels = {
  name: "Name",
  email: "Work email",
  company: "Company",
  role: "Role",
  platform: "Chat platform",
  message: "What would you like to test?",
};
const inputClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sio-border-strong";
export function PilotRequestForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const identity = useRef<{ payload: string; key: string } | null>(null);
  const sending = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState("");
  const receiptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (receipt) receiptRef.current?.focus();
  }, [receipt]);
  useUnsavedNavigation(dirty);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const values = normalizeContact(data as Partial<ContactValues>);
    const invalid = validateContact(values);
    setErrors(invalid);
    setMessage("");
    if (Object.keys(invalid).length) {
      form
        .querySelector<HTMLElement>(
          `[name="${contactFieldOrder.find((field) => invalid[field])}"]`,
        )
        ?.focus();
      return;
    }
    const payload = JSON.stringify({
      ...values,
      companyWebsite: data.companyWebsite,
    });
    if (identity.current?.payload !== payload)
      identity.current = { payload, key: crypto.randomUUID() };
    sending.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/pilot-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": identity.current.key,
        },
        body: payload,
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (
        !response.ok ||
        result?.ok !== true ||
        result.receipt !== identity.current.key
      ) {
        if (result?.errors) setErrors(result.errors);
        const retry = response.headers.get("Retry-After");
        setMessage(
          response.status === 429
            ? `Too many requests. ${retry && /^\d{1,10}$/.test(retry) ? `Retry after ${retry} seconds.` : "Wait before retrying."} Your request has not been confirmed.`
            : "We could not confirm receipt. Retry safely with the same details.",
        );
        const field = contactFieldOrder.find(
          (field) => result?.errors?.[field],
        );
        if (field)
          form.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
        return;
      }
      setReceipt(result.receipt);
      setDirty(false);
    } catch {
      setMessage(
        "We could not confirm receipt. Retry safely with the same details.",
      );
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  if (receipt)
    return (
      <div
        ref={receiptRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="panel space-y-3 p-5 focus-visible:outline-2 focus-visible:outline-sio-border-strong"
      >
        <h2 className="text-heading-20">Pilot request received</h2>
        <p>Your request was stored. Keep this receipt for follow-up:</p>
        <p className="break-all font-mono" translate="no">
          {receipt}
        </p>
        <p>No email or customer message was sent.</p>
        <a href="/pilot" className="btn-secondary">
          Open pilot checklist
        </a>
      </div>
    );
  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      onChange={() => setDirty(true)}
      className="space-y-4"
      aria-label="Request a pilot"
    >
      <fieldset disabled={pending} className="space-y-4">
        {contactFieldOrder.map((field) => (
          <div key={field} className="space-y-1">
            <label htmlFor={`pilot-${field}`} className="block text-label-14">
              {labels[field]}
              {["name", "email", "company"].includes(field)
                ? " (required)"
                : ""}
            </label>
            {field === "platform" ? (
              <select
                id={`pilot-${field}`}
                name={field}
                defaultValue=""
                className={`${inputClass} bg-background text-foreground`}
                aria-invalid={!!errors[field]}
                aria-describedby={
                  errors[field] ? `pilot-${field}-error` : undefined
                }
              >
                <option value="">Choose a platform…</option>
                {chatPlatforms.map((platform) => (
                  <option key={platform}>{platform}</option>
                ))}
              </select>
            ) : field === "message" ? (
              <textarea
                id={`pilot-${field}`}
                name={field}
                defaultValue={emptyContact[field]}
                rows={4}
                className={inputClass}
                aria-invalid={!!errors[field]}
                aria-describedby={
                  errors[field] ? `pilot-${field}-error` : undefined
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
              />
            ) : (
              <input
                id={`pilot-${field}`}
                name={field}
                defaultValue=""
                type={field === "email" ? "email" : "text"}
                autoComplete={
                  {
                    name: "name",
                    email: "email",
                    company: "organization",
                    role: "organization-title",
                  }[field]
                }
                spellCheck={field === "email" ? false : undefined}
                className={inputClass}
                aria-invalid={!!errors[field]}
                aria-describedby={
                  errors[field] ? `pilot-${field}-error` : undefined
                }
              />
            )}
            {errors[field] ? (
              <p
                id={`pilot-${field}-error`}
                className="text-sm"
                aria-live="polite"
              >
                {errors[field]}
              </p>
            ) : null}
          </div>
        ))}
        <div hidden aria-hidden="true">
          <label htmlFor="pilot-website">Company website</label>
          <input
            id="pilot-website"
            name="companyWebsite"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
      </fieldset>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="btn-primary min-h-11 touch-manipulation"
      >
        {pending ? <ButtonSpinner /> : null}Request a pilot
      </button>
    </form>
  );
}
