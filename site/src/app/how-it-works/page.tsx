import { PageContext } from "@/components/seo/PageContext";
import Link from "@/components/navigation/GuardedLink";
import { exportGuide } from "@/lib/seo-content";
import { PilotFacts } from "@/components/sections/PilotFacts";
import { marketingCopy } from "@/lib/marketing-copy";
import { howToJsonLd, jsonLdScript, routeMetadata } from "@/lib/site";
import type { Metadata } from "next";
import { ChartLineUp, ListChecks, Tag, UploadSimple } from "@phosphor-icons/react/ssr";
import { FinalCta } from "@/components/sections/FinalCta";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FourStepScroll } from "./FourStepScroll";
import { nb } from "@/lib/site";

export const metadata: Metadata = routeMetadata("/how-it-works");

const surfaces = [
  {
    icon: ListChecks,
    title: "Insights",
    body: marketingCopy.workflow[0].text,
  },
  {
    icon: UploadSimple,
    title: "Upload",
    body: marketingCopy.workflow[1].text,
  },
  {
    icon: ChartLineUp,
    title: "Eval",
    body: marketingCopy.workflow[2].text,
  },
  {
    icon: Tag,
    title: "Taxonomy",
    body: marketingCopy.workflow[3].text,
  },
];

const timeline = [
  {
    when: "Day 0",
    title: marketingCopy.workflow[4].text,
    body: marketingCopy.workflow[5].text,
  },
  {
    when: "Days 1–3",
    title: marketingCopy.workflow[6].text,
    body: marketingCopy.workflow[7].text,
  },
  {
    when: "Around day 7",
    title: marketingCopy.workflow[8].text,
    body: marketingCopy.workflow[9].text,
  },
  {
    when: "Days 10–14",
    title: marketingCopy.workflow[10].text,
    body: marketingCopy.workflow[11].text,
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader path="/how-it-works"
        eyebrow="How It Works"
        title={marketingCopy.workflow[12].text}
        description={marketingCopy.workflow[13].text}
      />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(howToJsonLd("/how-it-works#section")) }} />
      <FourStepScroll />
      <section id="export-analysis" aria-labelledby="export-analysis-title" className="section">
        <div className="container-page max-w-3xl">
          <h2 id="export-analysis-title" className="text-heading-24">Intercom and WhatsApp chat export analysis</h2>
          {exportGuide.map(item => <div key={item.title} className="mt-6">
            <h3 className="text-heading-20">{item.title}</h3>
            <p className="mt-3 text-copy-16 text-sio-fg-subtle">{item.text}</p>
          </div>)}
          <p className="mt-6 text-copy-16"><Link href="/security" className="underline">Review chat data handling</Link> before you <Link href="/contact" className="underline">request a conversation intelligence pilot</Link>.</p>
        </div>
      </section>

      <section id="shadow-mode" aria-labelledby="shadow-title" className="section">
        <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
          <SectionHeader
            id="shadow-title"
            eyebrow="Shadow Mode"
            title={marketingCopy.workflow[14].text}
            description={marketingCopy.workflow[15].text}
          />
          <RevealGroup as="ul" className="border-t border-sio-border-base">
            {[
              "Sioona detects signals and shows the evidence.",
              "A person reviews each one before anything is acted on.",
              "Suggested Next Actions are display-only. Follow-up happens in your own tools.",
              "Marking a signal Acted records that your team followed up. It doesn’t send anything.",
            ].map((line) => (
              <RevealItem as="li" key={line} className="border-b border-sio-border-base py-4 text-copy-16 text-sio-fg-subtle">
                {nb(line)}
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      <section aria-labelledby="surfaces-title" className="section">
        <div className="container-page">
          <SectionHeader
            id="surfaces-title"
            eyebrow={marketingCopy.workflow[16].text}
            title={marketingCopy.workflow[17].text}
            description={marketingCopy.workflow[18].text}
          />
          <RevealGroup
            as="ul"
            gap={0.08}
            className="mt-12 grid gap-px overflow-hidden rounded-panel border border-sio-border-base bg-sio-border-base md:grid-cols-2"
          >
            {surfaces.map(({ icon: Icon, title, body }) => (
              <RevealItem as="li" key={title} className="bg-sio-bg-base p-5 lg:p-6">
                <Icon size={20} weight="bold" className="text-sio-fg-base" aria-hidden />
                <h3 className="text-heading-20 mt-4 text-sio-fg-base">{title}</h3>
                <p className="text-copy-14 mt-1.5 max-w-md text-sio-fg-subtle">{nb(body)}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      <section aria-labelledby="pilot-title" className="section">
        <div className="container-page">
          <SectionHeader
            id="pilot-title"
            eyebrow={marketingCopy.workflow[19].text}
            title={marketingCopy.workflow[20].text}
            description={marketingCopy.workflow[21].text}
          />
          <RevealGroup as="ol" gap={0.08} className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {timeline.map((item) => (
              <RevealItem as="li" key={item.when} className="border-t border-sio-border-strong pt-4">
                <p className="eyebrow">{item.when}</p>
                <h3 className="text-heading-16 mt-2 text-sio-fg-base">{item.title}</h3>
                <p className="text-copy-14 mt-1.5 text-sio-fg-subtle">{nb(item.body)}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      <PilotFacts />
      <FinalCta />
      <PageContext path="/how-it-works" />
    </>
  );
}
