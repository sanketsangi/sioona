import { ArrowRight } from "@phosphor-icons/react/ssr";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="section">
      <div className="container-page">
        <RevealGroup className="max-w-3xl" gap={0.08}>
          <RevealItem>
            <p className="eyebrow">Request A Pilot</p>
          </RevealItem>
          <RevealItem>
            <h2 id="cta-title" className="text-heading-40 mt-3 text-sio-fg-base">
              Find out what your chats already know.
            </h2>
          </RevealItem>
          <RevealItem>
            <p className="text-copy-18 mt-4 max-w-xl text-sio-fg-subtle">
              Start with one export. Review the signals with your team, and let the Signal&nbsp;Score tell you whether
              to go.
            </p>
          </RevealItem>
          <RevealItem className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/contact" large className="w-fit rounded-full">
              Request A Pilot
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
