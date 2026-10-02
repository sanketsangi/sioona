import type { Metadata } from "next";
import { Check } from "@phosphor-icons/react/ssr";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { nb } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start with a two-week Shadow Mode pilot. Pricing for ongoing use is shared after your Signal Score results. Contact us for details.",
  alternates: { canonical: "/pricing" },
  openGraph: { url: "/pricing", title: "Sioona Pricing" },
};

const tiers = [
  {
    name: "Pilot",
    summary: "Prove the signal on your own chats.",
    price: "Request A Pilot",
    cta: { label: "Request A Pilot", href: "/contact", primary: true },
    features: [
      "Two-week Shadow Mode pilot",
      "Insights, Upload, Eval and Taxonomy",
      "Signal Score against your own human review",
      "A clear go or no-go at the end",
    ],
  },
  {
    name: "Ongoing Insights",
    summary: "Keep reviewing and measuring after the pilot.",
    price: "Shared after your pilot",
    cta: { label: "Talk To Us", href: "/contact", primary: false },
    features: [
      "Continued review workflow",
      "Signal Score tracked over time",
      "Taxonomy tuned from your feedback",
    ],
  },
  {
    name: "Custom",
    summary: "Something specific in mind.",
    price: "Contact us",
    cta: { label: "Contact Us", href: "/contact", primary: false },
    features: [
      "Security or procurement questions",
      "Volume, data or rollout requirements",
      "Anything you’d like to discuss first",
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Start with a pilot. Decide with your own numbers."
        description="We don’t publish list prices yet. A pilot comes first, and the Signal Score tells you whether continuing makes sense."
      />
      <section aria-labelledby="tiers-title" className="section">
        <div className="container-page">
          <h2 id="tiers-title" className="sr-only">
            Plans
          </h2>
          <RevealGroup
            as="ul"
            gap={0.1}
            className="grid overflow-hidden rounded-panel border border-sio-border-base md:grid-cols-3 md:divide-x md:divide-sio-border-base max-md:divide-y max-md:divide-sio-border-base"
          >
            {tiers.map((tier) => (
              <RevealItem as="li" key={tier.name} className="flex flex-col bg-sio-bg-base p-5 lg:p-6">
                <h3 className="text-heading-20 text-sio-fg-base">{tier.name}</h3>
                <p className="text-copy-14 mt-1 text-sio-fg-subtle">{nb(tier.summary)}</p>
                <p className="mt-6 text-heading-24 text-sio-fg-base">{nb(tier.price)}</p>
                <ul className="mt-6 flex flex-col gap-2.5 border-t border-sio-border-base pt-5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-copy-14 text-sio-fg-subtle">
                      <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-sio-fg-base" aria-hidden />
                      <span>{nb(feature)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 pt-2 md:mt-auto">
                  <ButtonLink
                    href={tier.cta.href}
                    variant={tier.cta.primary ? "primary" : "secondary"}
                    className="w-full"
                  >
                    {tier.cta.label}
                  </ButtonLink>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>
    </>
  );
}
