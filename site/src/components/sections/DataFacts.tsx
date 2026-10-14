import Link from "@/components/navigation/GuardedLink";
import { dataFacts as facts } from "@/lib/public-facts";
import { ContactPolicyFacts } from "@/components/sections/ContactPolicyFacts";
export function DataFacts() {
  return <section className="section border-t border-sio-border-base" aria-labelledby="data-facts-title">
    <div className="container-page">
      <h2 id="data-facts-title" className="text-heading-32">Data facts before you share</h2>
      <p className="mt-3 max-w-2xl text-copy-16 text-sio-fg-subtle">The pilot request form is for business contact details. Customer exports come later, after the data terms are agreed.</p>
      <dl className="mt-6 grid gap-6 md:grid-cols-2">{facts.map(([title, body]) => <div key={title} className="border-t border-sio-border-base pt-4">
        <dt className="text-heading-16">{title}</dt><dd className="mt-2 text-copy-14 text-sio-fg-subtle">{body}</dd>
      </div>)}</dl>
      <ContactPolicyFacts />
      <Link href="/contact" className="btn-secondary mt-6">Ask a data question</Link>
    </div>
  </section>;
}
