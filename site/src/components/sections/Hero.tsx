import { ArrowRight } from "@phosphor-icons/react/ssr";
import { InsightsMock } from "@/components/mocks/InsightsMock";
import { ButtonLink } from "@/components/ui/Button";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pb-16 pt-14 sm:pt-20 lg:pb-24 lg:pt-28">
      <div className="container-page">
        <div className="max-w-3xl">
          <p className="eyebrow">
            Conversation Intelligence
          </p>
          <h1 id="hero-title" className="text-heading-56 mt-4 text-sio-fg-base">
            See every revenue signal hiding in your customer chats.
          </h1>
          <p
            className="text-copy-18 rise mt-5 max-w-xl text-sio-fg-subtle"
            style={{ ["--rise-delay" as string]: "80ms" }}
          >
            Sioona flags lead, retention and upsell signals in the chats you already have, and your team reviews each
            one first.
          </p>
          <div
            className="rise mt-8 flex flex-wrap items-center gap-3"
            style={{ ["--rise-delay" as string]: "160ms" }}
          >
            <ButtonLink href="/contact" large className="w-fit rounded-full">
              Request A Pilot
              <ArrowRight size={16} weight="bold" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary" large className="w-fit rounded-full">
              See How It Works
            </ButtonLink>
          </div>
        </div>

        <div className="mt-12 lg:mt-16">
          <InsightsMock />
        </div>
      </div>
    </section>
  );
}
