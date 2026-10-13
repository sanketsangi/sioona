import { pageMetadata } from "@/lib/site";
import type { Metadata } from "next";
import { ChartLineUp, ListChecks, Tag, UploadSimple } from "@phosphor-icons/react/ssr";
import { FinalCta } from "@/components/sections/FinalCta";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FourStepScroll } from "./FourStepScroll";
import { nb } from "@/lib/site";

export const metadata: Metadata = pageMetadata("How It Works", "Connect chats, detect lead, retention and upsell signals, review them with your team, then act. Sioona runs in Shadow Mode, so nothing is acted on without a human.", "/how-it-works");

const surfaces = [
  {
    icon: ListChecks,
    title: "Insights",
    body: "The review queue. Pending, needs follow-up and done, with the transcript, the words that fired each signal, and a Suggested Next Action.",
  },
  {
    icon: UploadSimple,
    title: "Upload",
    body: "Bring chats in from Intercom JSON, WhatsApp Business text exports, or CSV and JSON files. Sensitive details are masked on ingest.",
  },
  {
    icon: ChartLineUp,
    title: "Eval",
    body: "Signal Score, measured as your team reviews. The go or no-go view for a pilot.",
  },
  {
    icon: Tag,
    title: "Taxonomy",
    body: "The phrases and keywords behind each signal type, with negative phrases that rule out noise. Tuned from review feedback.",
  },
];

const timeline = [
  {
    when: "Day 0",
    title: "Share one redacted export",
    body: "Tell us how many opportunities you find today. That’s your baseline.",
  },
  {
    when: "Days 1–3",
    title: "Review in Insights",
    body: "Your team marks signals Correct, Incorrect or Partially Correct, and marks the confirmed ones Acted.",
  },
  {
    when: "Around day 7",
    title: "Add a second export",
    body: "Upload new messages from the same conversations so the queue keeps moving.",
  },
  {
    when: "Days 10–14",
    title: "Read the Signal Score",
    body: "Compare your score to the agreed threshold and your baseline, then decide whether to continue.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How It Works"
        title="A four-step loop that keeps humans in charge."
        description="Sioona sits on top of the chats you already have. It finds the signals, your team reviews them, and the Signal Score tells you whether it’s ready to trust."
      />

      <FourStepScroll />

      <section id="shadow-mode" aria-labelledby="shadow-title" className="section">
        <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
          <SectionHeader
            id="shadow-title"
            eyebrow="Shadow Mode"
            title="Detection that runs beside your process, not instead of it."
            description="Sioona is not a chatbot. It never talks to your customers."
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
            eyebrow="Product Surfaces"
            title="Four places your team works."
            description="Each surface has one job, so a review session stays fast."
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
            eyebrow="A Two-Week Pilot"
            title="What a pilot looks like."
            description="A typical cadence. We agree the details with each team before you start."
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

      <FinalCta />
    </>
  );
}
