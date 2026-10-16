import { PageContext } from "@/components/seo/PageContext";
import { PilotFacts } from "@/components/sections/PilotFacts";
import { marketingCopy } from "@/lib/marketing-copy";
import { routeMetadata } from "@/lib/site";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { DataFacts } from "@/components/sections/DataFacts";

export const metadata: Metadata = routeMetadata("/pricing");
export default function PricingPage() {
  return <>
    <PageHeader path="/pricing" eyebrow="Pilot offer" title={marketingCopy.pricing[0].text}
      description={marketingCopy.pricing[1].text} />
    <section className="section" aria-labelledby="pilot-offer-title">
      <div className="container-page">
        <div className="panel mx-auto max-w-3xl p-6 lg:p-8">
          <h2 id="pilot-offer-title" className="text-heading-24">Pilot offer</h2>
          <p className="mt-3 text-copy-16 text-sio-fg-subtle">{marketingCopy.pricing[2].text}</p>
          <ul className="my-6 flex list-disc flex-col gap-3 pl-5 text-copy-16">
            <li>{marketingCopy.pricing[3].text}</li>
            <li>{marketingCopy.pricing[4].text}</li>
            <li>{marketingCopy.pricing[5].text}</li>
            <li>{marketingCopy.pricing[6].text}</li>
            <li>{marketingCopy.pricing[7].text}</li>
          </ul>
          <ButtonLink href="/contact">Request a pilot</ButtonLink>
          <p className="mt-4 text-copy-14 text-sio-fg-subtle">{marketingCopy.pricing[8].text}</p>
        </div>
      </div>
    </section>
    <PilotFacts />
    <DataFacts />
  <PageContext path="/pricing" />
    </>;
}
