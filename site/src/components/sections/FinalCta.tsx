import { marketingCopy } from "@/lib/marketing-copy";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="section final-cta">
      <div className="container-page">
        <RevealGroup className="final-cta-card" gap={0.08}>
          <RevealItem>
            <p className="eyebrow">Request a pilot</p>
          </RevealItem>
          <RevealItem>
            <h2 id="cta-title" className="text-heading-40 mt-3 text-sio-fg-base">
              {marketingCopy.finalCta[0].text}</h2>
          </RevealItem>
          <RevealItem>
            <p className="text-copy-18 mt-4 max-w-xl text-sio-fg-subtle">
              {marketingCopy.finalCta[1].text}</p>
          </RevealItem>
          <RevealItem className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/contact" large className="w-fit rounded-full">
              Request a pilot
              <ArrowRight size={16} weight="bold" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary" large className="w-fit rounded-full">
              See How It Works
            </ButtonLink>
          </RevealItem>
        </RevealGroup>
      </div>
    </section>
  );
}
