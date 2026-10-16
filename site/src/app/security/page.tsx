import { PageContext } from "@/components/seo/PageContext";
import { marketingCopy } from "@/lib/marketing-copy";
import { routeMetadata } from "@/lib/site";
import type { Metadata } from "next";
import { FileDashed, FileMagnifyingGlass, Info } from "@phosphor-icons/react/ssr";
import { FinalCta } from "@/components/sections/FinalCta";
import { securityPoints } from "@/components/sections/SecurityBand";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { nb } from "@/lib/site";

import { DataFacts } from "@/components/sections/DataFacts";

export const metadata: Metadata = routeMetadata("/security");

const dataHandling = [
  {
    icon: FileDashed,
    title: marketingCopy.security[0].text,
    body: marketingCopy.security[1].text,
  },
  {
    icon: FileMagnifyingGlass,
    title: "What we store",
    body: marketingCopy.security[2].text,
  },
];

const notNeeded = [
  "Live mailbox access",
  "API keys for your chat tools",
  "CRM credentials",
];

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Security"
        title={marketingCopy.security[3].text}
        description={marketingCopy.security[4].text}
      />

      <section aria-labelledby="principles-title" className="section">
        <div className="container-page">
          <h2 id="principles-title" className="sr-only">
            Principles
          </h2>
          <RevealGroup
            as="ul"
            gap={0.1}
            className="grid gap-8 md:grid-cols-3 md:gap-10"
          >
            {securityPoints.map(({ icon: Icon, title, body }) => (
              <RevealItem as="li" key={title} className="border-t border-sio-border-strong pt-5">
                <Icon size={20} weight="bold" className="text-sio-fg-base" aria-hidden />
                <h3 className="text-heading-20 mt-4 text-sio-fg-base">{nb(title)}</h3>
                <p className="text-copy-14 mt-2 text-sio-fg-subtle">{nb(body)}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      <section aria-labelledby="data-title" className="section">
        <div className="container-page">
          <SectionHeader
            id="data-title"
            eyebrow="Data Handling"
            title={marketingCopy.security[5].text}
            description={marketingCopy.security[6].text}
          />
          <RevealGroup
            as="ul"
            gap={0.1}
            className="mt-12 grid gap-px overflow-hidden rounded-panel border border-sio-border-base bg-sio-border-base md:grid-cols-2"
          >
            {dataHandling.map(({ icon: Icon, title, body }) => (
              <RevealItem as="li" key={title} className="bg-sio-bg-base p-5 lg:p-6">
                <Icon size={20} weight="bold" className="text-sio-fg-base" aria-hidden />
                <h3 className="text-heading-20 mt-4 text-sio-fg-base">{title}</h3>
                <p className="text-copy-14 mt-2 max-w-lg text-sio-fg-subtle">{nb(body)}</p>
              </RevealItem>
            ))}
          </RevealGroup>
          <div className="mt-10 max-w-2xl">
            <h3 className="text-heading-16 text-sio-fg-base">What we don’t need from you</h3>
            <ul className="mt-3 border-t border-sio-border-base">
              {notNeeded.map((item) => (
                <li key={item} className="border-b border-sio-border-base py-3 text-copy-14 text-sio-fg-subtle">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="docs-title" className="section">
        <div className="container-page">
          <div className="flex max-w-2xl gap-3 rounded-panel border border-sio-border-base bg-sio-bg-muted p-5">
            <Info size={20} weight="regular" className="mt-0.5 shrink-0 text-sio-fg-subtle" aria-hidden />
            <div>
              <h2 id="docs-title" className="text-heading-16 text-sio-fg-base">
                Compliance and certifications
              </h2>
              <p className="text-copy-14 mt-1.5 text-sio-fg-subtle">
                {marketingCopy.security[7].text}</p>
            </div>
          </div>
        </div>
      </section>

      <DataFacts />
      <FinalCta />
      <PageContext path="/security" />
    </>
  );
}
