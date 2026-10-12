import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { DataFacts } from "@/components/sections/DataFacts";
export const metadata: Metadata = { title: "Pilot offer", alternates: { canonical: "/pricing" } };
export default function PricingPage() {
  return <>
    <PageHeader eyebrow="Pilot offer" title="Two weeks. Your chats. A clear decision."
      description="Evaluate Sioona with one redacted export before committing to ongoing use." />
    <section className="section" aria-labelledby="pilot-offer-title">
      <div className="container-page">
        <div className="panel mx-auto max-w-3xl p-6 lg:p-8">
          <h2 id="pilot-offer-title" className="text-heading-24">Pilot offer</h2>
          <p className="mt-3 text-copy-16 text-sio-fg-subtle">Scope and price agreed before the pilot starts. No public list price is available yet.</p>
          <ul className="my-6 flex list-disc flex-col gap-3 pl-5 text-copy-16">
            <li>One redacted chat export, with no live integration required</li>
            <li>Two weeks of signal review in Shadow Mode</li>
            <li>Insights, uploads, evaluation and taxonomy tools</li>
            <li>A Signal Score measured against your team’s review</li>
            <li>An agreed threshold and a clear go or no-go decision</li>
          </ul>
          <ButtonLink href="/contact">Request a pilot</ButtonLink>
          <p className="mt-4 text-copy-14 text-sio-fg-subtle">Ongoing use, volume and procurement requirements are discussed separately after the results.</p>
        </div>
      </div>
    </section>
    <DataFacts />
  </>;
}
