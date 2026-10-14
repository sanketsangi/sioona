import { marketingCopy } from "@/lib/marketing-copy";
import { SignalSnippet } from "@/components/sections/SignalSnippet";
import { SignalTypeChip, type SignalType } from "@/components/signal/SignalChips";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { nb } from "@/lib/site";

const signals: {
  type: SignalType;
  title: string;
  body: string;
  before: string;
  quote: string;
  after?: string;
  reason: string;
}[] = [
  {
    type: "lead",
    title: marketingCopy.signals[0].text,
    body: marketingCopy.signals[1].text,
    before: "We’re ",
    quote: "opening accounts for our whole team",
    after: ". Who should we talk to?",
    reason: "Buying intent for multiple seats.",
  },
  {
    type: "retention",
    title: marketingCopy.signals[2].text,
    body: marketingCopy.signals[3].text,
    before: "Honestly, I’m ",
    quote: "thinking about moving my account",
    after: " somewhere else.",
    reason: "Intent to leave.",
  },
  {
    type: "upsell",
    title: marketingCopy.signals[4].text,
    body: marketingCopy.signals[5].text,
    before: "Can I get higher limits? I ",
    quote: "hit the cap every week",
    after: ".",
    reason: "Need exceeds current plan.",
  },
];

export function Signals() {
  return (
    <section id="product" aria-labelledby="signals-title" className="section">
      <div className="container-page">
        <SectionHeader
          id="signals-title"
          eyebrow="Three Signals"
          title={marketingCopy.signals[6].text}
          description={marketingCopy.signals[7].text}
        />
        <RevealGroup
          gap={0.1}
          className="signals-grid mt-12 grid md:grid-cols-3"
        >
          {signals.map((signal, index) => (
            <RevealItem key={signal.type} className="signal-card flex flex-col gap-5 bg-sio-bg-base p-5 lg:p-6">
              <span className="signal-card-number" aria-hidden>0{index + 1}</span>
              <div className="flex flex-col items-start gap-3">
                <SignalTypeChip type={signal.type} />
                <h3 className="text-heading-20 text-sio-fg-base">{nb(signal.title)}</h3>
                <p className="text-copy-14 text-sio-fg-subtle">{nb(signal.body)}</p>
              </div>
              <div className="mt-auto">
                <SignalSnippet
                  type={signal.type}
                  before={signal.before}
                  quote={signal.quote}
                  after={signal.after}
                  reason={signal.reason}
                  delay={0.2 + index * 0.1}
                />
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
