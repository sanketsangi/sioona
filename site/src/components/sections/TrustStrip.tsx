import { Marquee } from "@/components/sections/Marquee";
import { Reveal } from "@/components/motion/Reveal";

export function TrustStrip() {
  return (
    <section aria-labelledby="trust-title" className="border-t border-sio-border-base py-12 lg:py-16">
      <div className="container-page">
        <Reveal>
          <h2 id="trust-title" className="eyebrow text-center">
            Works on top of the chat tools your team already uses
          </h2>
          <p className="mt-2 text-center text-label-13 text-sio-fg-muted">
            Placeholder logos. Customer names appear here once pilots are public.
          </p>
        </Reveal>
        <Reveal className="mt-8" delay={0.1}>
          <Marquee />
        </Reveal>
      </div>
    </section>
  );
}
