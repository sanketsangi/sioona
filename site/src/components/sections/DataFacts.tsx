import Link from "@/components/navigation/GuardedLink";
const facts = [
  ["Retention and deletion", "A standard retention period is not published yet. Agree the pilot retention window, deletion process and backup handling before sharing an export."],
  ["Storage and region", "Pilot data includes redacted message text, detected signals and review decisions. Hosting region and storage providers must be confirmed for your pilot before transfer."],
  ["Encryption and access", "Request the pilot’s encryption-at-rest, transport and operator-access details during security review. Published certifications and an audit report are not available yet."],
  ["DPA and subprocessors", "Ask for a data processing agreement and subprocessor details in your pilot request. Confirm the required documents before sending customer data."],
];
export function DataFacts() {
  return <section className="section border-t border-sio-border-base" aria-labelledby="data-facts-title">
    <div className="container-page">
      <h2 id="data-facts-title" className="text-heading-32">Data facts before you share</h2>
      <p className="mt-3 max-w-2xl text-copy-16 text-sio-fg-subtle">The pilot request form is for business contact details. Customer exports come later, after the data terms are agreed.</p>
      <dl className="mt-6 grid gap-6 md:grid-cols-2">{facts.map(([title, body]) => <div key={title} className="border-t border-sio-border-base pt-4">
        <dt className="text-heading-16">{title}</dt><dd className="mt-2 text-copy-14 text-sio-fg-subtle">{body}</dd>
      </div>)}</dl>
      <Link href="/contact" className="btn-secondary mt-6">Ask a data question</Link>
    </div>
  </section>;
}
