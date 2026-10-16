import { PageContext } from "@/components/seo/PageContext";
import { ContactPolicyFacts } from "@/components/sections/ContactPolicyFacts";
import { marketingCopy } from "@/lib/marketing-copy";
import { routeMetadata } from "@/lib/site";
import type { Metadata } from "next";
import { ContactForm } from "@/components/forms/ContactForm";
import { RevealGroup, RevealItem, Reveal } from "@/components/motion/Reveal";
import { PageHeader } from "@/components/ui/PageHeader";
import { nb } from "@/lib/site";
import { contactPolicy } from "@/lib/contact-policy";

export const metadata: Metadata = routeMetadata("/contact");

const next = [
  {
    title: marketingCopy.contact[0].text,
    body: marketingCopy.contact[1].text,
  },
  {
    title: marketingCopy.contact[2].text,
    body: marketingCopy.contact[3].text,
  },
  {
    title: marketingCopy.contact[4].text,
    body: marketingCopy.contact[5].text,
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Request a pilot"
        title={marketingCopy.contact[6].text}
        description={marketingCopy.contact[7].text}
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
            <ContactPolicyFacts />
            <ContactForm supportEmail={contactPolicy().supportEmail} />
          </Reveal>
        </div>
      </section>
      <PageContext path="/contact" />
    </>
  );
}
