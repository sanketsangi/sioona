import { contactPolicy, contactPolicyText } from "@/lib/contact-policy";
export function ContactPolicyFacts() {
  const policy = contactPolicy();
  return <div className="mt-6 text-copy-14 text-sio-fg-subtle break-words">
    {contactPolicyText(policy).map(text => <p key={text} className="mt-2">{text}</p>)}
    {policy.supportEmail ? <a className="underline" href={`mailto:${encodeURIComponent(policy.supportEmail)}`}>Email {policy.supportEmail}</a> : null}
  </div>;
}
