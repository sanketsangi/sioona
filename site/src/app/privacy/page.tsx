import { pageMetadata } from "@/lib/site";
import { privacyParagraphs } from "@/lib/public-facts";
import { ContactPolicyFacts } from "@/components/sections/ContactPolicyFacts";
import type { Metadata } from "next";
import Link from "@/components/navigation/GuardedLink";
import { PageHeader } from "@/components/ui/PageHeader";
export const metadata: Metadata = pageMetadata("Pilot request privacy notice", "How Sioona uses business contact details submitted through the pilot request form, and how to request access, correction or deletion.", "/privacy");
export default function Page() { return <><PageHeader eyebrow="Privacy" title="Pilot request privacy notice" description="Applies to the business contact form for pilot enquiries." /><section className="section"><div className="container-page"><div className="flex max-w-3xl flex-col gap-5 text-copy-16 text-sio-fg-subtle">{privacyParagraphs.map(text => <p key={text}>{text}</p>)}<ContactPolicyFacts /><Link href="/contact" className="btn-secondary self-start">Contact Sioona</Link></div></div></section></>; }
