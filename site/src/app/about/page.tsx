import { PageContext } from "@/components/seo/PageContext";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { aboutParagraphs } from "@/lib/about";
import { nb, routeMetadata } from "@/lib/site";

export const metadata: Metadata = routeMetadata("/about");

export default function AboutPage() {
  return (
    <>
      <PageHeader
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
      <PageContext path="/about" />
    </>
  );
}
