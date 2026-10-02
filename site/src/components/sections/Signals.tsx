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
    title: "Buying intent, caught in the moment",
    body: "A prospect or existing customer shows they want to buy, open more accounts or bring in their team.",
    before: "We’re ",
    quote: "opening accounts for our whole team",
    after: ". Who should we talk to?",
    reason: "Buying intent for multiple seats.",
  },
  {
    type: "retention",
    title: "Churn risk, before the cancellation",
    body: "A customer hints they may leave, pause or switch. Your team sees it while there is still time to respond.",
    before: "Honestly, I’m ",
    quote: "thinking about moving my account",
    after: " somewhere else.",
    reason: "Intent to leave.",
  },
  {
    type: "upsell",
    title: "Expansion, in the customer’s own words",
    body: "A customer asks for more than their current plan gives them, and tells you exactly what they need.",
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
          title="Three kinds of revenue signal, found in every conversation."
          description="Sioona looks for the moments that matter to revenue and shows you the exact words that triggered each one."
        />
        <RevealGroup
          gap={0.1}
          className="mt-12 grid overflow-hidden rounded-panel border border-sio-border-base md:grid-cols-3 md:divide-x md:divide-sio-border-base max-md:divide-y max-md:divide-sio-border-base"
        >
          {signals.map((signal, index) => (
            <RevealItem key={signal.type} className="flex flex-col gap-5 bg-sio-bg-base p-5 lg:p-6">
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
