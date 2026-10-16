import { PageContext } from "@/components/seo/PageContext";
import Link from "@/components/navigation/GuardedLink";
import { signalUseCases } from "@/lib/seo-content";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { aboutParagraphs } from "@/lib/about";
import { nb, routeMetadata } from "@/lib/site";

export const metadata: Metadata = routeMetadata("/about");

export default function AboutPage() {
  return (
    <>
      <PageHeader path="/about"
        eyebrow="About"
        title="Conversation intelligence with a human in control."
        description="Sioona reads the chats you already have, surfaces revenue signals, and keeps every action with your team."
      />
      <section aria-labelledby="about-title" className="section">
        <div className="container-page">
          <h2 id="about-title" className="text-heading-24 text-sio-fg-base">
            How a pilot stays in human hands
          </h2>
          <div className="mt-5 flex max-w-3xl flex-col gap-5 text-copy-16 text-sio-fg-subtle">
            {aboutParagraphs.map((paragraph) => (
              <p key={paragraph}>{nb(paragraph)}</p>
            ))}
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/contact">Request a pilot</ButtonLink>
              <ButtonLink href="/how-it-works" variant="secondary">
                How it works
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
      <section aria-labelledby="signals-for-teams" className="section">
        <div className="container-page max-w-3xl">
          <h2 id="signals-for-teams" className="text-heading-24">Revenue signals in B2B customer conversations</h2>
          {signalUseCases.map(item => <div key={item.id} className="mt-6">
            <h3 className="text-heading-20">{item.title}</h3>
            <p className="mt-3 text-copy-16 text-sio-fg-subtle">{item.text}</p>
          </div>)}
          <p className="mt-6 text-copy-16"><Link className="underline" href="/how-it-works#export-analysis">See how chat export analysis works</Link> or <Link className="underline" href="/pricing">evaluate a two-week pilot</Link>.</p>
        </div>
      </section>
    <PageContext path="/about" /></>
  );
}
