import { contactPolicy, contactPolicyText } from "@/lib/contact-policy";

export function ContactPolicyFacts() {
  const policy = contactPolicy();
  const facts = contactPolicyText(policy);
  if (!facts.length && !policy.supportEmail) return null;

  return (
    <div className="policy-notice-box mb-6 rounded-xl border border-sio-border-base bg-sio-bg-subtle p-4 text-copy-13 text-sio-fg-subtle break-words shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block size-2 rounded-full bg-sio-signal-upsell-fg" aria-hidden="true" />
        <span className="text-label-12 font-medium uppercase tracking-wider text-sio-fg-base">
          Data handling & retention
        </span>
      </div>
      <div className="space-y-1.5 leading-relaxed text-sio-fg-muted">
        {facts.map((text) => (
          <p key={text}>{text}</p>
        ))}
        {policy.supportEmail ? (
          <p className="pt-0.5">
            <a
              className="text-sio-fg-base underline underline-offset-2 hover:text-sio-signal-upsell-fg"
              href={`mailto:${encodeURIComponent(policy.supportEmail)}`}
            >
              Email {policy.supportEmail}
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
