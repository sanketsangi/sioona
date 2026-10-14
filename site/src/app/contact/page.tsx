import { pageMetadata } from "@/lib/site";
import type { Metadata } from "next";
import { ContactForm } from "@/components/forms/ContactForm";
import { RevealGroup, RevealItem, Reveal } from "@/components/motion/Reveal";
import { PageHeader } from "@/components/ui/PageHeader";
import { nb } from "@/lib/site";
import { contactPolicy } from "@/lib/contact-policy";

export const metadata: Metadata = pageMetadata("Request a pilot", "Request a two-week Shadow Mode pilot. Share one redacted chat export and see lead, retention and upsell signals with your own Signal Score.", "/contact");

const next = [
  {
    title: "We reply with a short plan",
    body: "What to export, how to redact it, and the Signal Score threshold we’ll use.",
  },
  {
    title: "You share one export",
    body: "An Intercom, WhatsApp or CSV export of support or sales chats. No integrations to approve.",
  },
  {
    title: "Your team reviews for two weeks",
    body: "Signals appear in Insights. Nothing is sent to customers, and you decide whether to go.",
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Request a pilot"
        title="Tell us where your chats live."
        description="A pilot takes one export and a couple of hours of review across two weeks."
      />
      <section aria-labelledby="contact-title" className="border-t border-sio-border-base py-12 lg:py-20">
        <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <div>
            <h2 id="contact-title" className="text-heading-24 text-sio-fg-base">
              What happens next
            </h2>
            <RevealGroup as="ol" className="mt-6 border-t border-sio-border-base">
              {next.map((item, index) => (
                <RevealItem as="li" key={item.title} className="flex gap-4 border-b border-sio-border-base py-5">
                  <span className="tabular font-mono text-label-12 text-sio-fg-muted">0{index + 1}</span>
                  <div>
                    <h3 className="text-heading-16 text-sio-fg-base">{item.title}</h3>
                    <p className="text-copy-14 mt-1 text-sio-fg-subtle">{nb(item.body)}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
          <Reveal>
            <ContactForm supportEmail={contactPolicy().supportEmail} />
          </Reveal>
        </div>
      </section>
    </>
  );
}
