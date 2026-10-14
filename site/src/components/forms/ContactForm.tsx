"use client";
import { honeypotField } from "@/lib/contact";


import { CheckCircle, CircleNotch } from "@phosphor-icons/react/ssr";
import Link from "@/components/navigation/GuardedLink";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  chatPlatforms,
  contactFieldOrder,
  emptyContact,
  normalizeContact,
  validateContact,
  validateField,
  type ContactErrors,
  type ContactField,
  type ContactValues,
} from "@/lib/contact";

import { useNavigationGuard } from "@/components/navigation/GuardedLink";

type Status = "idle" | "submitting" | "success" | "error";

const inputIds: Record<ContactField, string> = {
  name: "contact-name",
  email: "contact-email",
  company: "contact-company",
  role: "contact-role",
  platform: "contact-platform",
  message: "contact-message",
};

function FieldShell({
  field,
  label,
  hint,
  error,
  children,
}: {
  field: ContactField;
  label: string;
  hint: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputIds[field]} className="flex items-baseline justify-between gap-3 text-label-14 font-medium text-sio-fg-base">
        {label}
        <span className="text-label-12 font-normal text-sio-fg-muted">{hint}</span>
      </label>
      {children}
      {error ? (
        <p id={`${inputIds[field]}-error`} className="text-label-13 text-sio-status-danger-fg">
          <span className="font-medium">Error: </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ContactForm({ supportEmail = "" }: { supportEmail?: string }) {
  const [values, setValues] = useState<ContactValues>(emptyContact);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [announce, setAnnounce] = useState("");
  const [receipt, setReceipt] = useState("");
  const requestIdentity = useRef<{ payload: string; key: string } | null>(null);
  const fieldRefs = useRef<Partial<Record<ContactField, HTMLElement | null>>>({});

  const { setBlocked } = useNavigationGuard();
  const dirty = contactFieldOrder.some((field) => values[field].trim() !== "");

  useEffect(() => {
    setBlocked(dirty && status !== "success");
    return () => setBlocked(false);
  }, [dirty, status, setBlocked]);

  useEffect(() => {
    if (!dirty || status === "success") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, status]);

  const focusFirstError = (next: ContactErrors) => {
    const first = contactFieldOrder.find((field) => next[field]);
    if (first) fieldRefs.current[first]?.focus();
  };

  const setField = (field: ContactField) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    if (touched[field]) {
      setErrors((current) => ({ ...current, [field]: validateField(field, value) }));
    }
  };

  const blurField = (field: ContactField) => () => {
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors((current) => ({ ...current, [field]: validateField(field, values[field]) }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "submitting") return;

    const clean = normalizeContact(values);
    const found = validateContact(clean);
    setValues(clean);
    setTouched(Object.fromEntries(contactFieldOrder.map((field) => [field, true])));
    setErrors(found);

    const count = Object.keys(found).length;
    if (count > 0) {
      setAnnounce(`${count} ${count === 1 ? "field needs" : "fields need"} attention.`);
      focusFirstError(found);
      return;
    }

    const payload = JSON.stringify({ ...clean, [honeypotField]: new FormData(event.currentTarget).get(honeypotField) || "" });
    if (requestIdentity.current?.payload !== payload) requestIdentity.current = { payload, key: crypto.randomUUID() };
    setStatus("submitting");
    setAnnounce("Sending your request…");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestIdentity.current.key },
        body: payload,
        signal: AbortSignal.timeout(12000),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; receipt?: string; error?: string; errors?: ContactErrors } | null;
      if (response.ok && data?.ok === true && data.receipt === requestIdentity.current.key) {
        setReceipt(data.receipt);
        setStatus("success");
        setAnnounce("Your pilot request was stored. Keep your receipt for reference.");
        return;
      }
      if (data?.errors) {
        setErrors(data.errors);
        setStatus("idle");
        setAnnounce("Some fields need attention.");
        focusFirstError(data.errors);
        return;
      }
      setStatus("error");
      setAnnounce(data?.error || "We could not store your request. Please retry.");
    } catch {
      setStatus("error");
      setAnnounce("We could not confirm receipt. Your details are preserved. Retry safely, or contact support.");
    }
  };

  if (status === "success") {
    return (
      <div className="panel overflow-hidden" aria-live="polite">
        <div className="flex items-start gap-4 p-6 lg:p-8">
          <span
            aria-hidden
            className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-control bg-sio-status-success-bg text-sio-status-success-fg"
          >
            <CheckCircle size={16} weight="bold" />
          </span>
          <div className="min-w-0">
            <h2 className="text-heading-24 text-sio-fg-base">Request received</h2>
            <p className="text-copy-16 mt-1 max-w-prose text-sio-fg-subtle">
              Thanks, {values.name.split(" ")[0] || "there"}. Your pilot request has been stored for review.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 border-t border-sio-border-base px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8 lg:px-8">
          <dl className="min-w-0">
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
              <dt className="shrink-0 text-label-13 text-sio-fg-muted">Receipt</dt>
              <dd className="min-w-0 font-mono text-label-13 break-all text-sio-fg-base" translate="no">
                {receipt}
              </dd>
            </div>
          </dl>
          <Link href="/" className="btn-secondary shrink-0">
            Back To Home
          </Link>
        </div>
      </div>
    );
  }

  const submitting = status === "submitting";
  const describedBy = (field: ContactField) => (errors[field] ? `${inputIds[field]}-error` : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="panel flex flex-col gap-5 p-5 lg:p-6" aria-describedby="contact-privacy contact-status">
      <div hidden aria-hidden="true"><label htmlFor="contact-website">Company website</label><input id="contact-website" name={honeypotField} tabIndex={-1} autoComplete="off" defaultValue="" /></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FieldShell field="name" label="Name" hint="Required" error={errors.name}>
          <input
            ref={(el) => {
              fieldRefs.current.name = el;
            }}
            id={inputIds.name}
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Alex Morgan…"
            value={values.name}
            onChange={setField("name")}
            onBlur={blurField("name")}
            aria-required="true"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy("name")}
            className="input-field"
          />
        </FieldShell>
        <FieldShell field="email" label="Work Email" hint="Required" error={errors.email}>
          <input
            ref={(el) => {
              fieldRefs.current.email = el;
            }}
            id={inputIds.email}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="alex@company.com…"
            value={values.email}
            onChange={setField("email")}
            onBlur={blurField("email")}
            aria-required="true"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy("email")}
            className="input-field"
          />
        </FieldShell>
        <FieldShell field="company" label="Company" hint="Required" error={errors.company}>
          <input
            ref={(el) => {
              fieldRefs.current.company = el;
            }}
            id={inputIds.company}
            name="company"
            type="text"
            autoComplete="organization"
            placeholder="Company name…"
            value={values.company}
            onChange={setField("company")}
            onBlur={blurField("company")}
            aria-required="true"
            aria-invalid={errors.company ? true : undefined}
            aria-describedby={describedBy("company")}
            className="input-field"
          />
        </FieldShell>
        <FieldShell field="role" label="Role" hint="Optional" error={errors.role}>
          <input
            ref={(el) => {
              fieldRefs.current.role = el;
            }}
            id={inputIds.role}
            name="role"
            type="text"
            autoComplete="organization-title"
            placeholder="Head of Customer Success…"
            value={values.role}
            onChange={setField("role")}
            onBlur={blurField("role")}
            aria-invalid={errors.role ? true : undefined}
            aria-describedby={describedBy("role")}
            className="input-field"
          />
        </FieldShell>
      </div>

      <FieldShell field="platform" label="Where Do Your Chats Live?" hint="Optional" error={errors.platform}>
        <select
          ref={(el) => {
            fieldRefs.current.platform = el;
          }}
          id={inputIds.platform}
          name="platform"
          value={values.platform}
          onChange={setField("platform")}
          onBlur={blurField("platform")}
          aria-invalid={errors.platform ? true : undefined}
          aria-describedby={describedBy("platform")}
          className="input-field"
        >
          <option value="">Choose a platform…</option>
          {chatPlatforms.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </FieldShell>

      <FieldShell field="message" label="Anything We Should Know?" hint="Optional" error={errors.message}>
        <textarea
          ref={(el) => {
            fieldRefs.current.message = el;
          }}
          id={inputIds.message}
          name="message"
          rows={4}
          autoComplete="off"
          placeholder="What would you like to learn from your chats…"
          value={values.message}
          onChange={setField("message")}
          onBlur={blurField("message")}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={describedBy("message")}
          className="input-field"
        />
      </FieldShell>

      <div id="contact-privacy" className="rounded-lg border border-sio-border-base/60 bg-sio-bg-muted/30 p-3.5 text-copy-13 text-sio-fg-subtle">
        <p className="leading-relaxed">We use your business contact details to review this request and reply about a pilot. Please don’t include customer transcripts or sensitive data.</p>
        <p className="mt-2 text-label-12 text-sio-fg-muted leading-normal">By selecting “Request a pilot”, you consent to this use of your details as described in our <Link href="/privacy" className="underline hover:text-sio-fg-base">privacy notice</Link> and accept the <Link href="/terms" className="underline hover:text-sio-fg-base">pilot request terms</Link>. No subscription is created.</p>
      </div>
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <button type="submit" disabled={submitting} className="btn-primary btn-lg">
          {submitting ? <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden /> : null}
          Request a pilot
        </button>
        <p className="text-label-13 text-sio-fg-muted">We’ll reply about next steps. No chat access needed to start.</p>
      </div>

      <p id="contact-status" role={status === "error" ? "alert" : "status"} aria-live="polite" className={announce ? "text-label-13 text-sio-fg-subtle" : "sr-only"}>
        {announce}
      </p>
      {status === "error" && supportEmail ? (
        <p className="text-copy-14 text-sio-fg-subtle">
          If retrying fails, <a href={`mailto:${encodeURIComponent(supportEmail)}`} className="underline">email {supportEmail}</a>. Please don’t include customer transcripts or sensitive data.
        </p>
      ) : null}
    </form>
  );
}
